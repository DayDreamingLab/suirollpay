import { it, expect } from 'vitest';
import { bcs } from '@mysten/sui/bcs';
import { fromHex } from '@mysten/sui/utils';
import { validateEffects, type EffectEvidence } from '../lib/sui/settlement';
import { hash, makePlan } from '../lib/domain/engine';
import type { PublicConfig } from '../lib/domain/types';
const c = {
  packageId: '0x' + 'a'.repeat(64),
  coinType: '0x' + 'b'.repeat(64) + '::usdc::USDC',
  treasury: '0x' + 'c'.repeat(64),
  network: 'testnet',
  decimals: 6,
} as PublicConfig;
async function fixture() {
  const plan = await makePlan(
    'run',
    'org',
    [
      {
        contractorId: 'person',
        name: 'Test',
        wallet: '0x' + 'd'.repeat(64),
        amount: '1000000',
        invoiceIds: ['INV-1'],
        breakdown: {
          base: '1000000',
          bonus: '0',
          reimbursement: '0',
          deduction: '0',
          tax: '0',
          fee: '0',
        },
      },
    ],
    c,
  );
  const schema = bcs.struct('Event', {
    organization_hash: bcs.vector(bcs.u8()),
    run_hash: bcs.vector(bcs.u8()),
    plan_hash: bcs.vector(bcs.u8()),
    total_amount: bcs.u64(),
    recipient_count: bcs.u64(),
    executor: bcs.Address,
  });
  const result: EffectEvidence = {
    status: { success: true },
    digest: 'test-digest',
    transaction: { sender: c.treasury },
    balanceChanges: [
      { address: c.treasury, coinType: c.coinType, amount: '-1000000' },
      {
        address: plan.payments[0].wallet,
        coinType: c.coinType,
        amount: '1000000',
      },
    ],
    events: [
      {
        eventType: `${c.packageId}::payroll_registry::PayrollExecuted<${c.coinType}>`,
        bcs: schema
          .serialize({
            organization_hash: fromHex(await hash('org')),
            run_hash: fromHex(plan.runHash),
            plan_hash: fromHex(plan.hash),
            total_amount: plan.total,
            recipient_count: '1',
            executor: c.treasury,
          })
          .toBytes(),
      },
    ],
  };
  return { plan, result };
}
it('accepts exact transfers and matching registry evidence', async () => {
  const { plan, result } = await fixture();
  await expect(validateEffects(plan, c, result)).resolves.toMatchObject({
    eventVerified: true,
  });
});
it('rejects a changed recipient amount', async () => {
  const { plan, result } = await fixture();
  result.balanceChanges[1].amount = '999999';
  await expect(validateEffects(plan, c, result)).rejects.toThrow(
    'amounts differ',
  );
});
it('rejects unexpected stablecoin recipients', async () => {
  const { plan, result } = await fixture();
  result.balanceChanges.push({
    address: '0x' + 'e'.repeat(64),
    coinType: c.coinType,
    amount: '1',
  });
  await expect(validateEffects(plan, c, result)).rejects.toThrow('Unexpected');
});
it('rejects missing payroll events', async () => {
  const { plan, result } = await fixture();
  result.events = [];
  await expect(validateEffects(plan, c, result)).rejects.toThrow('evidence');
});
it('rejects failed execution even if a response was received', async () => {
  const { plan, result } = await fixture();
  result.status.success = false;
  await expect(validateEffects(plan, c, result)).rejects.toThrow('failed');
});
