import { describe, it, expect } from 'vitest';
import { units, convert, decimal, U64_MAX } from '../lib/domain/money';
import { calculate, makePlan, verifyPlan } from '../lib/domain/engine';
import type { Contractor, PublicConfig } from '../lib/domain/types';
import { blankRow } from '../lib/demo';
const contractor: Contractor = {
  id: 'a',
  organization_id: 'org',
  name: 'Alice',
  email: 'alice@example.com',
  department: '',
  wallet: '0x' + '1'.repeat(64),
  rate: '100',
  status: 'active',
};
const row = { ...blankRow('a'), invoiceId: 'INV-1', base: '100' };
describe('financial arithmetic', () => {
  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(units('9007199254.740993', 6)).toBe(9007199254740993n);
    expect(decimal(9007199254740993n, 6)).toBe('9007199254.740993');
  });
  it('rejects missing, negative, scientific and excess precision values', () => {
    for (const value of ['', '-1', '1e3', 'NaN', '1.0000001'])
      expect(() => units(value, 6)).toThrow();
  });
  it('rejects overflow', () =>
    expect(() => units((U64_MAX + 1n).toString(), 0)).toThrow());
  it('rounds FX deterministically half up', () =>
    expect(convert(1n, '0.5')).toBe(1n));
  it('calculates all components', () => {
    const r = calculate(
      [
        {
          ...row,
          bonus: '10',
          reimbursement: '5',
          deduction: '2',
          tax: '3',
          fee: '1',
        },
      ],
      [contractor],
      6,
      '1000',
    );
    expect(r.total).toBe('109000000');
  });
});
describe('payroll controls', () => {
  it('blocks contradictory duplicate invoices', () => {
    const r = calculate(
      [row, { ...row, base: '200' }],
      [contractor],
      6,
      '1000',
    );
    expect(
      r.findings.some(
        (f) => f.code === 'CONFLICTING_INVOICE' && f.severity === 'BLOCK',
      ),
    ).toBe(true);
  });
  it('excludes a duplicate invoice with a finding', () => {
    const result = calculate(
      [row, { ...row, invoiceId: ' inv-1 ' }],
      [contractor],
      6,
      '1000',
    );
    expect(result.total).toBe('100000000');
    expect(result.findings.some((f) => f.code === 'DUPLICATE')).toBe(true);
  });
  it('excludes already paid invoices', () =>
    expect(
      calculate([row], [contractor], 6, '1000', ['a:inv-1']).payments,
    ).toHaveLength(0));
  it('blocks invalid wallets', () =>
    expect(
      calculate([row], [{ ...contractor, wallet: 'not-address' }], 6, '1000')
        .findings[0].severity,
    ).toBe('BLOCK'));
  it('blocks an aggregate policy breach', () =>
    expect(
      calculate(
        [row, { ...row, invoiceId: 'INV-2' }],
        [contractor],
        6,
        '150',
      ).findings.some((f) => f.code === 'POLICY_LIMIT'),
    ).toBe(true));
  it('blocks deductions greater than earnings', () =>
    expect(
      calculate(
        [{ ...row, deduction: '101' }],
        [contractor],
        6,
        '1000',
      ).findings.some((f) => f.severity === 'BLOCK'),
    ).toBe(true));
  it('detects tampered plans', async () => {
    const c = {
      network: 'testnet',
      coinType: '0x2::usdc::USDC',
      decimals: 6,
      treasury: '0x' + '2'.repeat(64),
    } as PublicConfig;
    const p = await makePlan(
      'r',
      'org',
      calculate([row], [contractor], 6, '1000').payments,
      c,
    );
    await expect(verifyPlan(p)).resolves.toBeUndefined();
    await expect(verifyPlan({ ...p, total: '1' })).rejects.toThrow();
  });
});
