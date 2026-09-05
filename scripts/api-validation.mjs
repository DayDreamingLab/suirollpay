import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
loadEnvFile('../.env.local');
const e = process.env;
const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const checks = [];
let userId, orgId, token;
function check(label, pass) {
  checks.push({ label, pass: !!pass });
  if (!pass) throw new Error(label);
}
async function api(action, data = {}) {
  const r = await fetch('http://localhost:3000/api/actions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ action, data }),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(`${action}: ${value.error}`);
  return value;
}
try {
  const password = crypto.randomUUID() + 'Aa!';
  const email = `suiroll-api-${crypto.randomUUID()}@example.com`;
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  const client = createClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const login = await client.auth.signInWithPassword({ email, password });
  token = login.data.session.access_token;
  const org = await api('createWorkspace', {
    name: 'Temporary API validation',
  });
  orgId = org.id;
  check('Authenticated workspace creation', !!orgId);
  await api('saveContractor', {
    contractor: {
      name: 'Validation contractor',
      email: 'contractor@validation.example',
      department: 'Testing',
      wallet: '0x' + '1'.repeat(64),
      rate: '0.1',
      status: 'active',
    },
  });
  const all = await fetch('http://localhost:3000/api/data', {
    headers: { Authorization: 'Bearer ' + token },
  }).then((r) => r.json());
  const contractor = all.contractors[0];
  check('Contractor persistence', !!contractor?.id);
  const source = {
    headers: ['Contractor', 'Invoice', 'Base'],
    records: [
      { Contractor: contractor.email, Invoice: 'TEST-001', Base: '0.1' },
      { Contractor: contractor.email, Invoice: 'TEST-001', Base: '0.1' },
    ],
  };
  const run = await api('createRun', {
    name: 'API validation payroll',
    period: '2026-09',
    source,
    filename: 'validation.csv',
  });
  check('Source import persisted', !!run.source_id);
  const parsed = await api('processRun', { id: run.id });
  check(
    'Gonka mapped source and preserved exact base',
    parsed.rows[0].base === '0.1' &&
      parsed.rows[0].contractorId === contractor.id,
  );
  const finalized = await api('finalizeRun', {
    id: run.id,
    rows: parsed.rows,
    confirmed: true,
  });
  check(
    'Duplicate invoice excluded deterministically',
    finalized.plan?.total === '100000' &&
      finalized.findings.some((f) => f.code === 'DUPLICATE'),
  );
  const preflight = await api('preflight', {
    id: run.id,
    wallet: e.PAYROLL_TREASURY_ADDRESS,
  });
  check('Real Sui simulation through app API', !!preflight.bytes);
  const approval = await api('approve', {
    id: run.id,
    wallet: e.PAYROLL_TREASURY_ADDRESS,
    planHash: finalized.plan.hash,
    confirmed: true,
  });
  check('Exact approval persisted and invoices reserved', !!approval.bytes);
  let blocked = false;
  try {
    await api('submit', {
      id: run.id,
      bytes: approval.bytes,
      signature: 'invalid-signature',
    });
  } catch {
    blocked = true;
  }
  check('Invalid signature blocked before submission', blocked);
  const saved = await admin
    .from('payroll_runs')
    .select('status,digest')
    .eq('id', run.id)
    .single();
  check(
    'No transaction submitted',
    saved.data.status === 'APPROVED' && saved.data.digest === null,
  );
  const retry = await api('createRun', {
    name: 'Duplicate reservation check',
    period: '2026-09',
    rows: parsed.rows,
  });
  const retryPlan = await api('finalizeRun', {
    id: retry.id,
    rows: parsed.rows,
    confirmed: true,
  });
  blocked = false;
  try {
    await api('approve', {
      id: retry.id,
      wallet: e.PAYROLL_TREASURY_ADDRESS,
      planHash: retryPlan.plan.hash,
      confirmed: true,
    });
  } catch {
    blocked = true;
  }
  check('Concurrent duplicate approval rejected', blocked);
} catch (error) {
  checks.push({ label: error.message, pass: false });
} finally {
  if (orgId) {
    const sources = await admin
      .from('sources')
      .select('storage_path')
      .eq('organization_id', orgId);
    const paths =
      sources.data?.map((x) => x.storage_path).filter(Boolean) || [];
    if (paths.length) await admin.storage.from('payroll-sources').remove(paths);
    for (const table of [
      'invoice_claims',
      'paid_invoices',
      'approvals',
      'transactions',
      'ai_operations',
      'audit_logs',
      'payroll_runs',
      'sources',
      'contractors',
      'memberships',
    ])
      await admin.from(table).delete().eq('organization_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
}
await writeFile(
  'docs/api-validation.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
);
console.log(JSON.stringify(checks, null, 2));
if (checks.some((x) => !x.pass)) process.exitCode = 1;
