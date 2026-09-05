import { z } from 'zod';
import { checked, AppError, context, audit } from './db';
import { config } from './config';
import { calculate, makePlan, hash } from '../domain/engine';
import {
  operation,
  mappingSchema,
  noteSchema,
  summarySchema,
} from '../ai/operations';
import type { PayrollRun, InputRow, Contractor } from '../domain/types';
import { rowSchema, importSchema } from './schemas';
type Context = Awaited<ReturnType<typeof context>>;
export async function getRun(ctx: Context, id: string) {
  const run = checked(
    await ctx.client
      .from('payroll_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .single(),
  ) as PayrollRun;
  if (!run) throw new AppError('Payroll not found.', 404);
  return run;
}
export async function createRun(ctx: Context, data: unknown) {
  const input = z
    .object({
      name: z.string().min(1).max(100),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      rows: z.array(rowSchema).max(250).optional(),
      source: importSchema.optional(),
      filename: z.string().max(100).optional(),
      original: z
        .object({
          base64: z.string().max(2800000),
          type: z.enum([
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ]),
        })
        .optional(),
      demo: z.boolean().optional(),
    })
    .parse(data);
  if (!input.rows?.length && !input.source)
    throw new AppError('Add a payroll source.');
  const content = input.source || { rows: input.rows };
  const sourceId = crypto.randomUUID();
  const path = `${ctx.organization.id}/${sourceId}/source.${input.original ? (input.original.type === 'text/csv' ? 'csv' : 'xlsx') : 'json'}`;
  const bytes = input.original
    ? Uint8Array.from(atob(input.original.base64), (c) => c.charCodeAt(0))
    : JSON.stringify(content);
  if (typeof bytes !== 'string' && bytes.length > 2_000_000)
    throw new AppError('Source exceeds 2 MB.');
  checked(
    await ctx.client.storage.from('payroll-sources').upload(path, bytes, {
      contentType: input.original?.type || 'application/json',
    }),
  );
  checked(
    await ctx.client.from('sources').insert({
      id: sourceId,
      organization_id: ctx.organization.id,
      name: input.filename || 'Payroll source',
      storage_path: path,
      source_hash: await hash(input.original?.base64 || content),
      content,
    }),
  );
  const run = checked(
    await ctx.client
      .from('payroll_runs')
      .insert({
        organization_id: ctx.organization.id,
        name: input.name,
        period: input.period,
        source_id: sourceId,
        rows: input.rows || [],
        demo: input.demo || false,
        status: input.rows?.length ? 'ACTION_REQUIRED' : 'DRAFT',
      })
      .select('*')
      .single(),
  );
  await audit(
    ctx.client,
    ctx.organization.id,
    ctx.user.id,
    'Payroll source imported',
    run.id,
  );
  return run;
}
export async function processRun(ctx: Context, id: string) {
  const run = await getRun(ctx, id);
  if (!['DRAFT', 'PROCESSING', 'ACTION_REQUIRED'].includes(run.status))
    return run;
  if (run.rows.length) return run;
  const source = checked(
    await ctx.client
      .from('sources')
      .select('content')
      .eq('id', run.source_id!)
      .eq('organization_id', ctx.organization.id)
      .single(),
  );
  const raw = importSchema.parse(source.content);
  const mapping = await operation(
    ctx.client,
    ctx.organization.id,
    run.id,
    'column_mapping',
    { headers: raw.headers },
    mappingSchema,
    'Map payroll columns. Return keys contractor, invoice, base, bonus, reimbursement, deduction, tax, fee, currency, fxRate, note. Values must be exact provided column names. Only contractor, invoice, base are required strings; other values are a column name or null. Never invent a column.',
    (result) => {
      const used = Object.values(result).filter((v): v is string => v !== null);
      if (
        used.some((v) => !raw.headers.includes(v)) ||
        new Set(used).size !== used.length
      )
        throw new AppError(
          'AI column mapping was ambiguous. Rename the source columns and retry.',
        );
    },
  );
  for (const [key, col] of Object.entries(mapping))
    if (col && !raw.headers.includes(col))
      throw new AppError(
        `AI mapped an unknown ${key} column. Rename columns and import again.`,
      );
  const contractors = checked(
    await ctx.client
      .from('contractors')
      .select('*')
      .eq('organization_id', ctx.organization.id),
  ) as Contractor[];
  const rows: InputRow[] = raw.records.map((record) => {
    const value = (col: string | null, fallback = '') =>
      col ? (record[col]?.trim() ?? '') : fallback;
    const name = value(mapping.contractor).toLowerCase();
    const candidates = contractors.filter((c) =>
      [c.id, c.name, c.email].some((x) => x.toLowerCase() === name),
    );
    return {
      contractorId: candidates.length === 1 ? candidates[0].id : '',
      invoiceId: value(mapping.invoice),
      base: value(mapping.base),
      bonus: value(mapping.bonus, '0'),
      reimbursement: value(mapping.reimbursement, '0'),
      deduction: value(mapping.deduction, '0'),
      tax: value(mapping.tax, '0'),
      fee: value(mapping.fee, '0'),
      currency: value(mapping.currency, 'USDC'),
      fxRate: value(mapping.fxRate, '1'),
      note: value(mapping.note),
    };
  });
  const saved = checked(
    await ctx.client
      .from('payroll_runs')
      .update({
        rows,
        status: 'ACTION_REQUIRED',
        findings: [
          {
            code: 'REVIEW_INPUT',
            severity: 'BLOCK',
            message:
              'Review imported inputs. Unmapped adjustment columns are explicitly set to zero; confirm these are correct before preparing.',
          },
        ],
      })
      .eq('id', id)
      .in('status', ['DRAFT', 'PROCESSING', 'ACTION_REQUIRED'])
      .select('*')
      .single(),
  );
  return saved;
}
export async function analyzeNotes(ctx: Context, id: string, batch: number) {
  const run = await getRun(ctx, id);
  const notes = run.rows
    .map((r, i) => ({ row: i + 1, evidence: r.note }))
    .filter((x) => x.evidence)
    .slice(batch * 25, (batch + 1) * 25);
  if (!notes.length) return { notes: [] };
  const result = await operation(
    ctx.client,
    ctx.organization.id,
    id,
    `note_review_${batch}`,
    notes,
    noteSchema,
    'Interpret each source note without changing amounts. Return {notes:[{row: source row number,evidence: exact source note,interpretation: concise explanation,requiresReview:true}]}. Do not add rows or payment instructions.',
    (result) => {
      if (
        result.notes.length !== notes.length ||
        new Set(result.notes.map((n) => n.row)).size !== notes.length ||
        result.notes.some(
          (n) =>
            !notes.some(
              (source) =>
                source.row === n.row && source.evidence === n.evidence,
            ),
        )
      )
        throw new AppError(
          'AI note evidence did not match the complete source batch.',
        );
    },
  );
  for (const note of result.notes)
    if (!notes.some((n) => n.row === note.row && n.evidence === note.evidence))
      throw new AppError('AI note evidence did not match the source.');
  return result;
}
export async function finalizeRun(ctx: Context, data: unknown) {
  const input = z
    .object({
      id: z.uuid(),
      rows: z.array(rowSchema).min(1).max(250),
      confirmed: z.literal(true),
    })
    .parse(data);
  const run = await getRun(ctx, input.id);
  if (!['DRAFT', 'ACTION_REQUIRED'].includes(run.status))
    throw new AppError(
      'This payroll is locked. Create a new run to change payment inputs.',
      409,
    );
  const contractors = checked(
    await ctx.client
      .from('contractors')
      .select('*')
      .eq('organization_id', ctx.organization.id),
  ) as Contractor[];
  const paid = checked(
    await ctx.client
      .from('paid_invoices')
      .select('contractor_id,invoice_id')
      .eq('organization_id', ctx.organization.id),
  );
  const result = calculate(
    input.rows,
    contractors,
    config().decimals,
    ctx.organization.max_payment,
    paid.map((p) => p.contractor_id + ':' + p.invoice_id),
  );
  const blocked = result.findings.some((f) => f.severity === 'BLOCK');
  const c = { ...config(), treasury: ctx.organization.treasury_address };
  const plan = blocked
    ? null
    : await makePlan(run.id, ctx.organization.id, result.payments, c);
  const saved = checked(
    await ctx.client
      .from('payroll_runs')
      .update({
        rows: input.rows,
        findings: result.findings,
        plan,
        status: blocked ? 'ACTION_REQUIRED' : 'PREPARED',
      })
      .eq('id', run.id)
      .in('status', ['DRAFT', 'ACTION_REQUIRED'])
      .select('*')
      .single(),
  );
  await audit(
    ctx.client,
    ctx.organization.id,
    ctx.user.id,
    'Payroll calculated and inputs verified',
    run.id,
    { planHash: plan?.hash, blocked },
  );
  return saved;
}
export async function summarize(ctx: Context, id: string) {
  const run = await getRun(ctx, id);
  if (!run.plan) throw new AppError('Calculate payroll before summarizing.');
  const result = await operation(
    ctx.client,
    ctx.organization.id,
    id,
    'payroll_summary',
    {
      recipients: run.plan.payments.length,
      totalUnits: run.plan.total,
      decimals: run.plan.decimals,
      findings: run.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
      })),
    },
    summarySchema,
    'Return {summary:string}. Summarize the validated payroll and findings in two sentences. Do not recalculate or change any amount.',
  );
  checked(
    await ctx.client
      .from('payroll_runs')
      .update({ summary: result.summary })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id),
  );
  return result;
}
