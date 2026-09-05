import { z } from 'zod';
import {
  route,
  identity,
  context,
  body,
  checked,
  audit,
  AppError,
} from '@/lib/server/db';
import { config, aiConfig } from '@/lib/server/config';
import { contractorSchema } from '@/lib/server/schemas';
import {
  createRun,
  processRun,
  finalizeRun,
  analyzeNotes,
  summarize,
} from '@/lib/server/payroll';
import {
  preflight,
  approve,
  submit,
  reconcile,
  retryFailed,
} from '@/lib/server/payment';
import { treasury } from '@/lib/sui/settlement';
import { units } from '@/lib/domain/money';
export const POST = route(async (req) => {
  const input = await body(req);
  const action = z.string().parse(input.action);
  const data = input.data || {};
  if (action === 'createWorkspace') {
    const { client, user } = await identity(req);
    const name = z.string().min(1).max(100).parse(data.name);
    const id = checked(
      await client.rpc('create_workspace', {
        p_user: user.id,
        p_name: name,
        p_treasury: config().treasury,
      }),
    );
    return { id };
  }
  const roles =
    action === 'treasury' ||
    action === 'integrations' ||
    action === 'sourceDownload'
      ? (['owner', 'admin', 'approver', 'viewer'] as const)
      : action === 'approve' ||
          action === 'preflight' ||
          action === 'submit' ||
          action === 'reconcile' ||
          action === 'retryFailed'
        ? (['owner', 'admin', 'approver'] as const)
        : (['owner', 'admin'] as const);
  const ctx = await context(req, [...roles]);
  const id = () => z.uuid().parse(data.id);
  switch (action) {
    case 'retryFailed':
      return retryFailed(ctx, id());
    case 'saveContractor': {
      const value = contractorSchema.parse(data.contractor);
      units(value.rate, config().decimals);
      if (data.id) {
        checked(
          await ctx.client
            .from('contractors')
            .update(value)
            .eq('id', id())
            .eq('organization_id', ctx.organization.id),
        );
      } else
        checked(
          await ctx.client
            .from('contractors')
            .insert({ ...value, organization_id: ctx.organization.id }),
        );
      await audit(
        ctx.client,
        ctx.organization.id,
        ctx.user.id,
        'Contractor saved',
      );
      return { ok: true };
    }
    case 'sourceDownload': {
      const run = checked(
        await ctx.client
          .from('payroll_runs')
          .select('source_id')
          .eq('id', id())
          .eq('organization_id', ctx.organization.id)
          .single(),
      );
      const source = checked(
        await ctx.client
          .from('sources')
          .select('storage_path')
          .eq('id', run.source_id)
          .eq('organization_id', ctx.organization.id)
          .single(),
      );
      return checked(
        await ctx.client.storage
          .from('payroll-sources')
          .createSignedUrl(source.storage_path, 60),
      );
    }
    case 'createRun':
      return createRun(ctx, data);
    case 'processRun':
      return processRun(ctx, id());
    case 'analyzeNotes':
      return analyzeNotes(
        ctx,
        id(),
        z.number().int().min(0).max(9).parse(data.batch),
      );
    case 'finalizeRun':
      return finalizeRun(ctx, data);
    case 'summarize':
      return summarize(ctx, id());
    case 'preflight':
      return preflight(ctx, data);
    case 'approve':
      return approve(ctx, data);
    case 'submit':
      return submit(ctx, data);
    case 'reconcile':
      return reconcile(ctx, id());
    case 'treasury':
      try {
        return await treasury(config());
      } catch {
        throw new AppError(
          'The treasury could not be reached. Check your network connection and retry.',
          503,
        );
      }
    case 'settings': {
      const value = z
        .object({ name: z.string().min(1).max(100), max_payment: z.string() })
        .parse(data);
      units(value.max_payment, config().decimals);
      checked(
        await ctx.client
          .from('organizations')
          .update(value)
          .eq('id', ctx.organization.id),
      );
      await audit(
        ctx.client,
        ctx.organization.id,
        ctx.user.id,
        'Workspace policy updated',
      );
      return { ok: true };
    }
    case 'setRole': {
      if (ctx.organization.role !== 'owner')
        throw new AppError('Only the owner can manage roles.', 403);
      const user = z.uuid().parse(data.userId);
      if (user === ctx.user.id) throw new AppError('Keep your owner access.');
      const role = z.enum(['admin', 'approver', 'viewer']).parse(data.role);
      checked(
        await ctx.client
          .from('memberships')
          .update({ role })
          .eq('user_id', user)
          .eq('organization_id', ctx.organization.id),
      );
      return { ok: true };
    }
    case 'integrations': {
      const ai = aiConfig();
      let gonka = false;
      try {
        const r = await fetch(ai.baseUrl.replace(/\/$/, '') + '/models', {
          headers: { Authorization: `Bearer ${ai.key}` },
          signal: AbortSignal.timeout(10000),
        });
        const data = (await r.json()) as { data?: { id: string }[] };
        gonka = r.ok && !!data.data?.some((x) => x.id === ai.model);
      } catch {}
      return {
        supabase: true,
        gonka,
        model: ai.model,
        network: config().network,
      };
    }
    default:
      throw new AppError('Unknown workspace action.');
  }
});
