import { it, expect } from 'vitest';
import { loadEnvFile } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { config } from '../lib/server/config';
import { makePlan } from '../lib/domain/engine';
import { prepare } from '../lib/sui/settlement';
import { GonkaProvider } from '../lib/ai/provider';
import { mappingSchema } from '../lib/ai/operations';
it.skipIf(!process.env.RUN_LIVE_CHECKS)(
  'simulates real testnet settlement without submitting it',
  async () => {
    loadEnvFile('../.env.local');
    const c = config();
    const plan = await makePlan(
      crypto.randomUUID(),
      crypto.randomUUID(),
      [
        {
          contractorId: 'simulation-only',
          name: 'Simulation recipient',
          wallet: '0x' + '1'.repeat(64),
          amount: '100000',
          invoiceIds: ['SIMULATION-ONLY'],
          breakdown: {
            base: '100000',
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
    const result = await prepare(plan, c, c.treasury);
    expect(result.bytes.length).toBeGreaterThan(0);
    await writeFile(
      'docs/simulation-validation.json',
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          simulationPassed: true,
          transactionSubmitted: false,
          total: '0.1 USDC',
          gasBudget: result.gasBudget,
        },
        null,
        2,
      ),
    );
  },
  60000,
);
it.skipIf(!process.env.RUN_LIVE_CHECKS)(
  'validates a real focused Gonka response',
  async () => {
    loadEnvFile('../.env.local');
    const result = await new GonkaProvider().structured(
      'validation_mapping',
      'Return keys contractor, invoice, base, bonus, reimbursement, deduction, tax, fee, currency, fxRate, note. Map exact header strings. Return null for absent optional columns.',
      { headers: ['Contractor', 'Invoice', 'Base'] },
      mappingSchema,
      async () => {},
    );
    expect(result.contractor).toBe('Contractor');
    expect(result.base).toBe('Base');
    await writeFile(
      'docs/gonka-validation.json',
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          structuredInferencePassed: true,
        },
        null,
        2,
      ),
    );
  },
  180000,
);
