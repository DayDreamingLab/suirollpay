import { z } from 'zod';
export const rowSchema = z
  .object({
    contractorId: z.string().max(100),
    invoiceId: z.string().min(1).max(150),
    base: z.string().max(40),
    bonus: z.string().max(40),
    reimbursement: z.string().max(40),
    deduction: z.string().max(40),
    tax: z.string().max(40),
    fee: z.string().max(40),
    currency: z.string().min(1).max(10),
    fxRate: z.string().max(40),
    note: z.string().max(1500),
  })
  .strict();
export const contractorSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email(),
    department: z.string().max(100),
    wallet: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    rate: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/),
    status: z.enum(['active', 'inactive']),
  })
  .strict();
export const importSchema = z
  .object({
    headers: z.array(z.string().max(100)).min(1).max(30),
    records: z
      .array(z.record(z.string(), z.string().max(1500)))
      .min(1)
      .max(250),
  })
  .strict();
