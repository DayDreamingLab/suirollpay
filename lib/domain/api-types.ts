import type { PayrollRun } from './types';
export type TreasuryState = {
  stablecoin: string;
  sui: string;
  authorized: boolean;
  registryValid: boolean;
  paused: boolean;
  decimalsMatch: boolean;
  symbol: string;
};
export type PreparedTransaction = {
  bytes: string;
  digest: string;
  balance: TreasuryState;
  gasBudget: string;
  expiresAt: string;
};
export type IntegrationState = {
  supabase: boolean;
  gonka: boolean;
  model: string;
  network: string;
};
export type PaymentResult = {
  digest?: string;
  status: string;
  pending?: boolean;
  message?: string;
};
export type ActionResults = {
  retryFailed: { ok: boolean };
  createWorkspace: { id: string };
  saveContractor: { ok: boolean };
  createRun: PayrollRun;
  processRun: PayrollRun;
  finalizeRun: PayrollRun;
  analyzeNotes: unknown;
  summarize: { summary: string };
  preflight: PreparedTransaction;
  approve: PreparedTransaction;
  submit: PaymentResult;
  reconcile: PaymentResult;
  treasury: TreasuryState;
  settings: { ok: boolean };
  setRole: { ok: boolean };
  integrations: IntegrationState;
  sourceDownload: { signedUrl: string };
};
