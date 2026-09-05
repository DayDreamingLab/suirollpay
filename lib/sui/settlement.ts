import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import {
  normalizeSuiAddress,
  normalizeStructTag,
  fromHex,
  toHex,
  toBase64,
} from '@mysten/sui/utils';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { PaymentPlan, PublicConfig } from '../domain/types';
import { hash, verifyPlan } from '../domain/engine';
export const GAS_BUDGET = 30_000_000n;
export function sui(c: PublicConfig) {
  return new SuiGrpcClient({ network: c.network, baseUrl: c.rpcUrl });
}
const EventSchema = bcs.struct('PayrollExecuted', {
  organization_hash: bcs.vector(bcs.u8()),
  run_hash: bcs.vector(bcs.u8()),
  plan_hash: bcs.vector(bcs.u8()),
  total_amount: bcs.u64(),
  recipient_count: bcs.u64(),
  executor: bcs.Address,
});
export async function treasury(c: PublicConfig) {
  const client = sui(c);
  const [usd, gas, cap, registry, metadata] = await Promise.all([
    client.getBalance({ owner: c.treasury, coinType: c.coinType }),
    client.getBalance({ owner: c.treasury }),
    client.getObject({ objectId: c.adminCapId }),
    client.getObject({ objectId: c.registryId, include: { json: true } }),
    client.core.getCoinMetadata({ coinType: c.coinType }),
  ]);
  return {
    stablecoin: usd.balance.balance,
    sui: gas.balance.balance,
    authorized:
      cap.object.owner.$kind === 'AddressOwner' &&
      normalizeSuiAddress(cap.object.owner.AddressOwner) ===
        normalizeSuiAddress(c.treasury),
    registryValid:
      registry.object.type ===
      `${normalizeSuiAddress(c.packageId)}::payroll_registry::Registry`,
    paused: registry.object.json?.paused === true,
    decimalsMatch: metadata.coinMetadata?.decimals === c.decimals,
    symbol: metadata.coinMetadata?.symbol || 'USDC',
  };
}
export type EffectEvidence = {
  status: { success: boolean };
  digest: string;
  transaction: { sender?: string | null };
  balanceChanges: SuiClientTypes.BalanceChange[];
  events: Pick<SuiClientTypes.Event, 'eventType' | 'bcs'>[];
};
export async function validateEffects(
  plan: PaymentPlan,
  c: PublicConfig,
  result: EffectEvidence,
) {
  if (!result.status.success)
    throw new Error(
      'The payment simulation failed. Check treasury funds and registry status.',
    );
  if (
    normalizeSuiAddress(result.transaction.sender!) !==
    normalizeSuiAddress(plan.treasury)
  )
    throw new Error('Transaction sender does not match the approved treasury.');
  const changes = new Map<string, bigint>();
  for (const change of result.balanceChanges) {
    if (
      normalizeStructTag(change.coinType) === normalizeStructTag(plan.coinType)
    ) {
      const address = normalizeSuiAddress(change.address);
      changes.set(
        address,
        (changes.get(address) || 0n) + BigInt(change.amount),
      );
    }
  }
  const expected = new Map<string, bigint>([
    [normalizeSuiAddress(plan.treasury), -BigInt(plan.total)],
  ]);
  for (const p of plan.payments)
    expected.set(
      normalizeSuiAddress(p.wallet),
      (expected.get(normalizeSuiAddress(p.wallet)) || 0n) + BigInt(p.amount),
    );
  for (const [address, amount] of expected)
    if ((changes.get(address) || 0n) !== amount)
      throw new Error(
        'Settlement amounts differ from the approved payment plan.',
      );
  for (const [address, amount] of changes)
    if (amount !== 0n && !expected.has(address))
      throw new Error('Unexpected stablecoin transfer detected.');
  const eventType = normalizeStructTag(
    `${c.packageId}::payroll_registry::PayrollExecuted<${c.coinType}>`,
  );
  const events = result.events.filter(
    (e) => normalizeStructTag(e.eventType) === eventType,
  );
  if (events.length !== 1)
    throw new Error('Payroll execution evidence is missing or ambiguous.');
  const e = EventSchema.parse(events[0].bcs);
  if (
    toHex(new Uint8Array(e.organization_hash)) !==
      (await hash(plan.organizationId)) ||
    toHex(new Uint8Array(e.run_hash)) !== plan.runHash ||
    toHex(new Uint8Array(e.plan_hash)) !== plan.hash ||
    e.total_amount !== plan.total ||
    e.recipient_count !== String(plan.payments.length) ||
    normalizeSuiAddress(e.executor) !== normalizeSuiAddress(plan.treasury)
  )
    throw new Error('Registry evidence does not match the approved plan.');
  return {
    digest: result.digest,
    planHash: plan.hash,
    recipientCount: plan.payments.length,
    total: plan.total,
    balanceChanges: result.balanceChanges,
    eventVerified: true,
  };
}
export async function prepare(
  plan: PaymentPlan,
  c: PublicConfig,
  wallet: string,
) {
  await verifyPlan(plan);
  if (
    normalizeSuiAddress(wallet) !== normalizeSuiAddress(c.treasury) ||
    normalizeSuiAddress(plan.treasury) !== normalizeSuiAddress(c.treasury)
  )
    throw new Error('Connect the authorized treasury wallet.');
  if (
    plan.network !== c.network ||
    normalizeStructTag(plan.coinType) !== normalizeStructTag(c.coinType) ||
    plan.decimals !== c.decimals
  )
    throw new Error(
      'Network or stablecoin configuration changed. Prepare a new payroll.',
    );
  const balance = await treasury(c);
  if (
    !balance.authorized ||
    !balance.registryValid ||
    balance.paused ||
    !balance.decimalsMatch
  )
    throw new Error(
      'Treasury authorization, registry, or stablecoin configuration needs attention.',
    );
  if (BigInt(balance.stablecoin) < BigInt(plan.total))
    throw new Error('Insufficient USDC. Fund the treasury before paying.');
  if (BigInt(balance.sui) < GAS_BUDGET)
    throw new Error(
      'Insufficient SUI for the payment fee. Keep at least 0.03 SUI in the treasury.',
    );
  const client = sui(c);
  const tx = new Transaction();
  tx.setSender(plan.treasury);
  tx.setGasBudget(GAS_BUDGET);
  tx.moveCall({
    target: `${c.packageId}::payroll_registry::record_execution`,
    typeArguments: [c.coinType],
    arguments: [
      tx.object(c.registryId),
      tx.object(c.adminCapId),
      tx.pure.vector('u8', fromHex(await hash(plan.organizationId))),
      tx.pure.vector('u8', fromHex(plan.runHash)),
      tx.pure.vector('u8', fromHex(plan.hash)),
      tx.pure.u64(plan.total),
      tx.pure.u64(plan.payments.length),
    ],
  });
  const coin = tx.add(
    coinWithBalance({ type: c.coinType, balance: BigInt(plan.total) }),
  );
  const pieces = tx.splitCoins(
    coin,
    plan.payments.map((p) => tx.pure.u64(p.amount)),
  );
  plan.payments.forEach((p, i) => tx.transferObjects([pieces[i]], p.wallet));
  tx.transferObjects([coin], plan.treasury);
  const bytes = await tx.build({ client });
  const simulation = await client.simulateTransaction({
    transaction: bytes,
    include: {
      effects: true,
      balanceChanges: true,
      events: true,
      transaction: true,
    },
  });
  const outcome = simulation.Transaction ?? simulation.FailedTransaction;
  await validateEffects(plan, c, outcome);
  return {
    bytes: toBase64(bytes),
    digest: await tx.getDigest({ client }),
    balance,
    gasBudget: GAS_BUDGET.toString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}
