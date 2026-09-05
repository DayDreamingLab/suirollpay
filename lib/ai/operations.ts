import { z } from 'zod';
import { GonkaProvider } from './provider';
import { hash } from '../domain/engine';
import { checked, AppError, db } from '../server/db';
import { aiConfig } from '../server/config';
export async function operation<T>(
  client: ReturnType<typeof db>,
  org: string,
  run: string,
  name: string,
  input: unknown,
  schema: z.ZodType<T>,
  instruction: string,
  validateResult?: (result: T) => void,
): Promise<T> {
  const inputHash = await hash(input);
  const version = name + ':v2';
  const existing = checked(
    await client
      .from('ai_operations')
      .select('*')
      .eq('run_id', run)
      .eq('operation', name)
      .eq('input_hash', inputHash)
      .eq('prompt_version', version)
      .maybeSingle(),
  );
  if (existing?.status === 'COMPLETED') {
    const result = schema.parse(existing.result);
    validateResult?.(result);
    return result;
  }
  if (
    existing?.lease_until &&
    new Date(existing.lease_until).getTime() > Date.now()
  )
    throw new AppError(
      'This AI step is already processing. Check again shortly.',
      409,
    );
  const record = {
    organization_id: org,
    run_id: run,
    operation: name,
    input_hash: inputHash,
    prompt_version: version,
    model: aiConfig().model,
    status: 'RUNNING',
    error: null,
    started_at: new Date().toISOString(),
    lease_until: new Date(Date.now() + 360000).toISOString(),
  };
  let id: string;
  if (existing) {
    const locked = checked(
      await client
        .from('ai_operations')
        .update(record)
        .eq('id', existing.id)
        .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
        .select('id')
        .maybeSingle(),
    );
    if (!locked) throw new AppError('This AI step is already processing.', 409);
    id = locked.id;
  } else {
    const created = await client
      .from('ai_operations')
      .insert(record)
      .select('id')
      .single();
    if (created.error?.code === '23505')
      throw new AppError('This AI step is already processing.', 409);
    id = checked(created).id;
  }
  try {
    const result = await new GonkaProvider().structured(
      name,
      instruction,
      input,
      schema,
      async (retry) => {
        checked(
          await client
            .from('ai_operations')
            .update({ status: 'RETRYING', retry_count: retry })
            .eq('id', id),
        );
      },
    );
    validateResult?.(result);
    checked(
      await client
        .from('ai_operations')
        .update({
          status: 'COMPLETED',
          result,
          output_hash: await hash(result),
          completed_at: new Date().toISOString(),
          lease_until: null,
        })
        .eq('id', id),
    );
    return result;
  } catch (e) {
    checked(
      await client
        .from('ai_operations')
        .update({
          status: 'FAILED',
          error: e instanceof Error ? e.message : 'AI unavailable',
          lease_until: null,
        })
        .eq('id', id),
    );
    throw new AppError(
      e instanceof Error ? e.message : 'AI processing failed.',
      503,
    );
  }
}
export const mappingSchema = z
  .object({
    contractor: z.string(),
    invoice: z.string(),
    base: z.string(),
    bonus: z.string().nullable(),
    reimbursement: z.string().nullable(),
    deduction: z.string().nullable(),
    tax: z.string().nullable(),
    fee: z.string().nullable(),
    currency: z.string().nullable(),
    fxRate: z.string().nullable(),
    note: z.string().nullable(),
  })
  .strict();
export const noteSchema = z
  .object({
    notes: z
      .array(
        z
          .object({
            row: z.number().int(),
            evidence: z.string().max(1000),
            interpretation: z.string().max(500),
            requiresReview: z.boolean(),
          })
          .strict(),
      )
      .max(25),
  })
  .strict();
export const summarySchema = z
  .object({ summary: z.string().max(1500) })
  .strict();
