import { it, expect } from 'vitest';
import { hash, makePlan, verifyPlan } from '../lib/domain/engine';
import type { PublicConfig } from '../lib/domain/types';
it('commitments survive PostgreSQL JSONB key reordering', async () => {
  expect(await hash({ b: 2, a: { z: 1, x: 3 } })).toBe(
    await hash({ a: { x: 3, z: 1 }, b: 2 }),
  );
  const plan = await makePlan(
    'r',
    'org',
    [
      {
        contractorId: 'c',
        name: 'C',
        wallet: '0x' + '1'.repeat(64),
        amount: '1',
        invoiceIds: ['i'],
        breakdown: {
          base: '1',
          bonus: '0',
          reimbursement: '0',
          deduction: '0',
          tax: '0',
          fee: '0',
        },
      },
    ],
    {
      network: 'testnet',
      coinType: '0x2::usdc::USDC',
      decimals: 6,
      treasury: '0x' + '2'.repeat(64),
    } as PublicConfig,
  );
  const stored = JSON.parse(
    JSON.stringify(plan, (_k, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).reverse())
        : v,
    ),
  );
  await expect(verifyPlan(stored)).resolves.toBeUndefined();
});
