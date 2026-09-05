import type { WorkspaceData } from './client';
import type { InputRow } from './domain/types';
export function demoData(): WorkspaceData {
  const org = 'demo';
  const date = new Date().toISOString();
  return {
    organization: {
      id: org,
      name: 'Acme Studio',
      treasury_address: '',
      max_payment: '100000',
      role: 'viewer',
    },
    user: { id: 'demo', email: 'Sample workspace' },
    contractors: [
      {
        id: 'sample-a',
        organization_id: org,
        name: 'Amelia Chen',
        email: 'amelia@example.com',
        department: 'Product design',
        wallet: '',
        rate: '3200',
        status: 'active',
      },
      {
        id: 'sample-b',
        organization_id: org,
        name: 'Marcus Reed',
        email: 'marcus@example.com',
        department: 'Engineering',
        wallet: '',
        rate: '4500',
        status: 'active',
      },
      {
        id: 'sample-c',
        organization_id: org,
        name: 'Sofia Martins',
        email: 'sofia@example.com',
        department: 'Marketing',
        wallet: '',
        rate: '2000',
        status: 'active',
      },
    ],
    runs: [
      {
        id: 'sample-run',
        organization_id: org,
        name: 'September contractor payroll',
        period: '2026-09',
        status: 'ACTION_REQUIRED',
        created_at: date,
        rows: [],
        findings: [
          {
            code: 'DEMO',
            severity: 'BLOCK',
            message:
              'Sample payroll only. Sign in and add verified contractor wallets to prepare real payments.',
          },
          {
            code: 'DUPLICATE',
            severity: 'WARN',
            message: 'Duplicate invoice MAR-0926 will be excluded.',
          },
        ],
        plan: null,
        summary:
          'Sample scenario: monthly retainers, a documented bonus, and one duplicate invoice. No AI call or payment has been made.',
        demo: true,
      },
    ],
    activity: [],
    operations: [],
    members: [],
  };
}
export function blankRow(contractorId = ''): InputRow {
  return {
    contractorId,
    invoiceId: '',
    base: '',
    bonus: '0',
    reimbursement: '0',
    deduction: '0',
    tax: '0',
    fee: '0',
    currency: 'USDC',
    fxRate: '1',
    note: '',
  };
}
