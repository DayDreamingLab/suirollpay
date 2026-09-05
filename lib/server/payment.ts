import { z } from 'zod';
import { fromBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyTransactionSignature } from '@mysten/sui/verify';
import { AppError, context, checked, audit } from './db';
import { getRun } from './payroll';
import { config } from './config';
import { prepare, sui, validateEffects } from '../sui/settlement';
type Context = Awaited<ReturnType<typeof context>>;
export async function retryFailed(ctx: Context, id: string) {
  const run = await getRun(ctx, id);
  if (run.status !== 'FAILED' || !run.digest)
    throw new AppError('Only a confirmed failed payment can be retried.');
  const result = await sui(config()).getTransaction({ digest: run.digest });
  if (!result.FailedTransaction)
    throw new AppError(
      'This payment is not confirmed failed. Reconcile it before taking further action.',
    );
  checked(
    await ctx.client
      .from('payroll_runs')
      .update({ status: 'PREPARED', digest: null, error: null })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'FAILED'),
  );
  await audit(
    ctx.client,
    ctx.organization.id,
    ctx.user.id,
    'Failed payment reopened for checks',
    id,
  );
  return { ok: true };
}
export async function preflight(ctx: Context, data: unknown) {
  const { id, wallet } = z
    .object({ id: z.uuid(), wallet: z.string() })
    .parse(data);
  const run = await getRun(ctx, id);
  if (!run.plan || !['PREPARED', 'READY', 'APPROVED'].includes(run.status))
    throw new AppError('Prepare payroll before approval.');
  const contractors = checked(
    await ctx.client
      .from('contractors')
      .select('id,wallet,status')
      .eq('organization_id', ctx.organization.id),
  );
  for (const payment of run.plan.payments) {
    const current = contractors.find((c) => c.id === payment.contractorId);
    if (
      !current ||
      current.status !== 'active' ||
      normalizeSuiAddress(current.wallet) !==
        normalizeSuiAddress(payment.wallet)
    )
      throw new AppError(
        'A contractor wallet or active status changed. Create a new payroll for fresh approval.',
      );
    if (
      normalizeSuiAddress(payment.wallet) ===
      normalizeSuiAddress(config().treasury)
    )
      throw new AppError(
        'A contractor wallet matches the treasury. Correct the contractor before paying.',
      );
  }
  try {
    return await prepare(run.plan, config(), wallet);
  } catch (e) {
    throw new AppError(
      e instanceof Error ? e.message : 'Payment checks failed.',
    );
  }
}
export async function approve(ctx: Context, data: unknown) {
  const { id, wallet, planHash, confirmed } = z
    .object({
      id: z.uuid(),
      wallet: z.string(),
      planHash: z.string(),
      confirmed: z.literal(true),
    })
    .parse(data);
  const run = await getRun(ctx, id);
  if (!confirmed || run.plan?.hash !== planHash)
    throw new AppError('Confirm the exact payment plan.');
  const ready = await preflight(ctx, { id, wallet });
  const result = await ctx.client.rpc('approve_payroll', {
    p_org: ctx.organization.id,
    p_run: id,
    p_user: ctx.user.id,
    p_hash: planHash,
    p_wallet: normalizeSuiAddress(wallet),
    p_bytes: ready.bytes,
    p_digest: ready.digest,
    p_expires: ready.expiresAt,
  });
  if (result.error)
    throw new AppError(
      result.error.code === 'PGRST202'
        ? 'Apply the approval reservations migration before paying.'
        : 'Approval was blocked. An invoice may already be paid or reserved by another run.',
      409,
    );
  return ready;
}
export async function submit(ctx: Context, data: unknown) {
  const { id, bytes, signature } = z
    .object({
      id: z.uuid(),
      bytes: z.string().max(300000),
      signature: z.string().max(4000),
    })
    .parse(data);
  const run = await getRun(ctx, id);
  if (!run.plan) throw new AppError('Payment plan missing.');
  if (run.status === 'PAID') return { digest: run.digest, status: 'PAID' };
  const approval = checked(
    await ctx.client
      .from('approvals')
      .select('*')
      .eq('run_id', id)
      .eq('organization_id', ctx.organization.id)
      .eq('plan_hash', run.plan.hash)
      .single(),
  );
  if (
    !approval ||
    approval.transaction_bytes !== bytes ||
    new Date(approval.expires_at).getTime() < Date.now()
  )
    throw new AppError(
      'Approval expired or transaction changed. Run the payment checks again.',
    );
  const raw = fromBase64(bytes);
  const key = await verifyTransactionSignature(raw, signature);
  if (
    normalizeSuiAddress(key.toSuiAddress()) !==
    normalizeSuiAddress(run.plan.treasury)
  )
    throw new AppError(
      'Signature does not belong to the authorized treasury.',
      403,
    );
  // Persist the deterministic transaction digest before sending. A lost response is recoverable without a second payment.
  checked(
    await ctx.client
      .from('payroll_runs')
      .update({ status: 'SUBMITTED', digest: approval.transaction_digest })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .in('status', ['APPROVED', 'SUBMITTED']),
  );
  checked(
    await ctx.client.from('transactions').upsert(
      {
        organization_id: ctx.organization.id,
        run_id: id,
        digest: approval.transaction_digest,
        plan_hash: run.plan.hash,
        status: 'SUBMITTED',
      },
      { onConflict: 'run_id' },
    ),
  );
  try {
    const result = await sui(config()).executeTransaction({
      transaction: raw,
      signatures: [signature],
      include: { effects: true },
    });
    if (result.FailedTransaction) {
      checked(
        await ctx.client
          .from('payroll_runs')
          .update({
            status: 'FAILED',
            error:
              'The network rejected this payment. No payroll transfers completed.',
          })
          .eq('id', id),
      );
      checked(
        await ctx.client
          .from('transactions')
          .update({ status: 'FAILED' })
          .eq('run_id', id),
      );
      throw new AppError(
        'Payment failed on Sui. No payroll transfers completed.',
      );
    }
    await audit(
      ctx.client,
      ctx.organization.id,
      ctx.user.id,
      'Payment submitted',
      id,
      { digest: result.Transaction.digest },
    );
    return { digest: result.Transaction.digest, status: 'SUBMITTED' };
  } catch (e) {
    if (e instanceof AppError) throw e;
    return {
      digest: approval.transaction_digest,
      status: 'SUBMITTED',
      pending: true,
    };
  }
}
export async function reconcile(ctx: Context, id: string) {
  const run = await getRun(ctx, id);
  if (run.status === 'PAID') return { status: 'PAID', digest: run.digest };
  if (!run.plan || !run.digest || run.status !== 'SUBMITTED')
    throw new AppError('Submit this payroll before reconciling.');
  try {
    const result = await sui(config()).waitForTransaction({
      digest: run.digest,
      timeout: 12000,
      include: {
        effects: true,
        balanceChanges: true,
        events: true,
        transaction: true,
      },
    });
    if (result.FailedTransaction) {
      checked(
        await ctx.client
          .from('payroll_runs')
          .update({
            status: 'FAILED',
            error:
              'Sui confirmed this transaction failed. No transfers completed.',
          })
          .eq('id', id),
      );
      throw new AppError('The transaction failed on Sui.');
    }
    const evidence = await validateEffects(
      run.plan,
      config(),
      result.Transaction,
    );
    checked(
      await ctx.client.rpc('reconcile_payroll', {
        p_org: ctx.organization.id,
        p_run: id,
        p_digest: run.digest,
        p_hash: run.plan.hash,
        p_effects: evidence,
      }),
    );
    return { status: 'PAID', digest: run.digest };
  } catch (e) {
    if (e instanceof AppError) throw e;
    return {
      status: 'SUBMITTED',
      digest: run.digest,
      pending: true,
      message: 'Confirmation is still pending. Retry reconciliation shortly.',
    };
  }
}
