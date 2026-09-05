export type Role = 'owner' | 'admin' | 'approver' | 'viewer';
export type Contractor = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  department: string;
  wallet: string;
  rate: string;
  status: 'active' | 'inactive';
  created_at?: string;
};
export type InputRow = {
  contractorId: string;
  invoiceId: string;
  base: string;
  bonus: string;
  reimbursement: string;
  deduction: string;
  tax: string;
  fee: string;
  currency: string;
  fxRate: string;
  note: string;
};
export type Finding = {
  code: string;
  severity: 'BLOCK' | 'WARN' | 'INFO';
  message: string;
  row?: number;
  contractorId?: string;
};
export type Payment = {
  contractorId: string;
  name: string;
  wallet: string;
  amount: string;
  invoiceIds: string[];
  breakdown: {
    base: string;
    bonus: string;
    reimbursement: string;
    deduction: string;
    tax: string;
    fee: string;
  };
};
export type PaymentPlan = {
  version: 1;
  organizationId: string;
  runId: string;
  network: string;
  coinType: string;
  decimals: number;
  treasury: string;
  payments: Payment[];
  total: string;
  hash: string;
  runHash: string;
};
export type RunStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'ACTION_REQUIRED'
  | 'PREPARED'
  | 'READY'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'PAID'
  | 'FAILED';
export type PayrollRun = {
  id: string;
  organization_id: string;
  name: string;
  period: string;
  status: RunStatus;
  created_at: string;
  source_id?: string;
  rows: InputRow[];
  findings: Finding[];
  plan: PaymentPlan | null;
  summary?: string;
  digest?: string;
  error?: string;
  demo: boolean;
};
export type Organization = {
  id: string;
  name: string;
  treasury_address: string;
  max_payment: string;
  role: Role;
};
export type Operation = {
  id: string;
  run_id: string;
  operation: string;
  status: string;
  retry_count: number;
  error?: string;
  result?: unknown;
  created_at: string;
};
export type PublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  rpcUrl: string;
  packageId: string;
  registryId: string;
  adminCapId: string;
  coinType: string;
  decimals: number;
  treasury: string;
};
