import { isValidTransactionSignature } from '@mysten/sui/verify';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { AppError } from './db';

export async function verifyTreasurySignature(
  bytes: Uint8Array,
  signature: string,
  treasury: string,
  client: ClientWithCoreApi,
) {
  let valid: boolean;
  try {
    // Social-login wallets need the configured network to verify their zkLogin
    // proof. The SDK also checks both supported zkLogin address encodings.
    valid = await isValidTransactionSignature(bytes, signature, {
      client,
      address: normalizeSuiAddress(treasury),
    });
  } catch {
    throw new AppError(
      'The Sui network could not verify your wallet signature. No payment was submitted. Reconnect your wallet on the configured network and retry this payroll.',
      503,
    );
  }
  if (!valid)
    throw new AppError(
      'The signature is invalid or does not belong to the configured treasury. No payment was submitted. Connect the treasury wallet and sign again.',
      403,
    );
}
