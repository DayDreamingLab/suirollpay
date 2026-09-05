import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
loadEnvFile('../.env.local');
const e = process.env;
const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [];
const users = [];
const orgs = [];
function check(label, pass) {
  results.push({ label, pass: !!pass });
  if (!pass) throw new Error(label);
}
try {
  for (const table of [
    'organizations',
    'contractors',
    'payroll_runs',
    'ai_operations',
    'approvals',
    'transactions',
    'paid_invoices',
    'invoice_claims',
    'audit_logs',
  ]) {
    const r = await admin
      .from(table)
      .select('*', { count: 'exact', head: true });
    check('Schema: ' + table, !r.error);
  }
  for (let i = 0; i < 2; i++) {
    const email = `suiroll-validation-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID() + 'Aa!';
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    check('Create temporary validation identity ' + i, !created.error);
    const user = created.data.user;
    users.push(user.id);
    const org = await admin.rpc('create_workspace', {
      p_user: user.id,
      p_name: 'Temporary validation workspace',
      p_treasury: e.PAYROLL_TREASURY_ADDRESS,
    });
    check('Create organization ' + i, !org.error);
    orgs.push(org.data);
    const client = createClient(
      e.NEXT_PUBLIC_SUPABASE_URL,
      e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false } },
    );
    const login = await client.auth.signInWithPassword({ email, password });
    check('Password sign-in ' + i, !login.error);
    const own = await client.from('organizations').select('id');
    check(
      'RLS exposes only own organization ' + i,
      own.data?.length === 1 && own.data[0].id === org.data,
    );
    const forged = await client.from('payroll_runs').insert({
      organization_id: org.data,
      name: 'Unauthorized',
      period: '2026-09',
      status: 'PAID',
    });
    check('Client cannot forge paid state ' + i, !!forged.error);
    const rpc = await client.rpc('create_workspace', {
      p_user: user.id,
      p_name: 'Unauthorized',
      p_treasury: e.PAYROLL_TREASURY_ADDRESS,
    });
    check('Privileged RPC is not callable by client ' + i, !!rpc.error);
    await client.auth.signOut();
  }
  const anon = createClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const read = await anon.from('organizations').select('*');
  check(
    'Anonymous clients cannot access organizations',
    !!read.error || read.data?.length === 0,
  );
} catch (error) {
  results.push({ label: 'Failure: ' + error.message, pass: false });
} finally {
  for (const id of orgs) {
    await admin.from('memberships').delete().eq('organization_id', id);
    await admin.from('organizations').delete().eq('id', id);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
await writeFile(
  'docs/integration-validation.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.pass)) process.exitCode = 1;
