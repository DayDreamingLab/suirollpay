import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { units, convert, U64_MAX } from './money';
import type {
  Contractor,
  InputRow,
  Finding,
  Payment,
  PaymentPlan,
  PublicConfig,
} from './types';
export async function hash(value: unknown): Promise<string> {
  const canonical =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (_key, item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(
                Object.entries(item).sort(([a], [b]) =>
                  a < b ? -1 : a > b ? 1 : 0,
                ),
              )
            : item,
        );
  const b = new TextEncoder().encode(canonical);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function calculate(
  rows: InputRow[],
  contractors: Contractor[],
  decimals: number,
  maxPayment: string,
  previousInvoices: string[] = [],
) {
  const findings: Finding[] = [];
  const payments: Payment[] = [];
  const invoices = new Set(previousInvoices);
  const invoiceInputs = new Map<string, string>();
  const wallets = new Map<string, string>();
  if (!rows.length)
    findings.push({
      code: 'EMPTY',
      severity: 'BLOCK',
      message: 'Add at least one payroll record.',
    });
  if (rows.length > 250)
    findings.push({
      code: 'LIMIT',
      severity: 'BLOCK',
      message: 'Split this source into payroll runs of at most 250 rows.',
    });
  const limit = units(maxPayment, decimals);
  rows.forEach((row, i) => {
    const fail = (
      code: string,
      message: string,
      severity: Finding['severity'] = 'BLOCK',
    ) =>
      findings.push({
        code,
        message,
        severity,
        row: i + 1,
        contractorId: row.contractorId,
      });
    const contractor = contractors.find(
      (c) => c.id === row.contractorId && c.status === 'active',
    );
    if (!contractor) {
      fail('CONTRACTOR', 'Match this row to an active contractor.');
      return;
    }
    if (!isValidSuiAddress(contractor.wallet)) {
      fail('WALLET', 'Contractor needs a valid Sui wallet.');
      return;
    }
    const wallet = normalizeSuiAddress(contractor.wallet);
    if (wallets.has(wallet) && wallets.get(wallet) !== contractor.id) {
      fail(
        'SHARED_WALLET',
        'Two contractors share the same wallet. Resolve this before paying.',
      );
      return;
    }
    wallets.set(wallet, contractor.id);
    if (!row.invoiceId.trim()) {
      fail('INVOICE', 'Invoice reference is required.');
      return;
    }
    const invoice = contractor.id + ':' + row.invoiceId.trim().toLowerCase();
    const financialInput = JSON.stringify([
      row.base,
      row.bonus,
      row.reimbursement,
      row.deduction,
      row.tax,
      row.fee,
      row.currency,
      row.fxRate,
    ]);
    if (invoices.has(invoice)) {
      if (
        invoiceInputs.has(invoice) &&
        invoiceInputs.get(invoice) !== financialInput
      ) {
        fail(
          'CONFLICTING_INVOICE',
          'The same invoice has conflicting financial inputs. Resolve the source before payment.',
        );
        return;
      }
      fail('DUPLICATE', 'Duplicate invoice excluded: ' + row.invoiceId, 'WARN');
      return;
    }
    invoices.add(invoice);
    invoiceInputs.set(invoice, financialInput);
    try {
      const breakdown = {
        base: units(row.base, decimals),
        bonus: units(row.bonus, decimals),
        reimbursement: units(row.reimbursement, decimals),
        deduction: units(row.deduction, decimals),
        tax: units(row.tax, decimals),
        fee: units(row.fee, decimals),
      };
      let amount =
        breakdown.base +
        breakdown.bonus +
        breakdown.reimbursement -
        breakdown.deduction -
        breakdown.tax -
        breakdown.fee;
      if (row.currency !== 'USDC') {
        if (!row.fxRate || row.fxRate === '0')
          throw new Error(
            'A verified exchange rate is required for non-USDC payroll.',
          );
        amount = convert(amount, row.fxRate);
      }
      if (amount <= 0n || amount > U64_MAX)
        throw new Error(
          'Net payment must be positive and within the settlement limit.',
        );
      if (amount > limit)
        fail(
          'POLICY_LIMIT',
          'Payment exceeds the organization’s approved per-contractor limit.',
        );
      if (
        contractor.rate &&
        amount > (units(contractor.rate, decimals) * 150n) / 100n
      )
        fail(
          'INCREASE',
          'Payment is more than 50% above the contractor’s base compensation. Review the breakdown.',
          'WARN',
        );
      if (row.note.trim())
        fail('NOTE', 'Source note requires review: ' + row.note, 'WARN');
      const existing = payments.find((p) => p.contractorId === contractor.id);
      if (existing) {
        existing.amount = (BigInt(existing.amount) + amount).toString();
        existing.invoiceIds.push(row.invoiceId);
        for (const key of Object.keys(breakdown) as (keyof typeof breakdown)[])
          existing.breakdown[key] = (
            BigInt(existing.breakdown[key]) + breakdown[key]
          ).toString();
        if (BigInt(existing.amount) > limit)
          fail(
            'POLICY_LIMIT',
            'Combined contractor payments exceed the approved limit.',
          );
      } else
        payments.push({
          contractorId: contractor.id,
          name: contractor.name,
          wallet,
          amount: amount.toString(),
          invoiceIds: [row.invoiceId],
          breakdown: Object.fromEntries(
            Object.entries(breakdown).map(([k, v]) => [k, v.toString()]),
          ) as Payment['breakdown'],
        });
    } catch (e) {
      fail(
        'AMOUNT',
        e instanceof Error ? e.message : 'Invalid financial input.',
      );
    }
  });
  const total = payments.reduce((a, p) => a + BigInt(p.amount), 0n);
  if (total > U64_MAX)
    findings.push({
      code: 'TOTAL_LIMIT',
      severity: 'BLOCK',
      message: 'Payroll total exceeds the settlement limit.',
    });
  return {
    payments: payments.sort((a, b) => a.wallet.localeCompare(b.wallet)),
    findings,
    total: total.toString(),
  };
}
export async function makePlan(
  runId: string,
  organizationId: string,
  payments: Payment[],
  config: PublicConfig,
): Promise<PaymentPlan> {
  if (!payments.length) throw new Error('There are no payable recipients.');
  const total = payments.reduce((a, p) => a + BigInt(p.amount), 0n).toString();
  const plan = {
    version: 1 as const,
    organizationId,
    runId,
    network: config.network,
    coinType: config.coinType,
    decimals: config.decimals,
    treasury: normalizeSuiAddress(config.treasury),
    payments,
    total,
    runHash: await hash(organizationId + ':' + runId),
  };
  return { ...plan, hash: await hash(plan) };
}
export async function verifyPlan(plan: PaymentPlan) {
  const { hash: commitment, ...body } = plan;
  if ((await hash(body)) !== commitment)
    throw new Error('Payment plan changed. Prepare it again.');
}
