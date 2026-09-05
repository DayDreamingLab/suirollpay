import { afterEach, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import * as verify from '@mysten/sui/verify';
import { verifyTreasurySignature } from '../lib/server/signature';
vi.mock('@mysten/sui/verify', { spy: true });

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
afterEach(() => vi.restoreAllMocks());
it('accepts an actual treasury signature and rejects wrong wallets, changed bytes, and malformed signatures', async () => {
  const key = Ed25519Keypair.generate();
  const bytes = new Uint8Array([1, 2, 3]);
  const { signature } = await key.signTransaction(bytes);
  await expect(verifyTreasurySignature(bytes, signature, key.toSuiAddress(), client)).resolves.toBeUndefined();
  await expect(verifyTreasurySignature(bytes, signature, Ed25519Keypair.generate().toSuiAddress(), client)).rejects.toMatchObject({ status: 403 });
  await expect(verifyTreasurySignature(new Uint8Array([9]), signature, key.toSuiAddress(), client)).rejects.toMatchObject({ status: 403 });
  await expect(verifyTreasurySignature(bytes, 'invalid', key.toSuiAddress(), client)).rejects.toMatchObject({ status: 403 });
});
it('supplies the network client and treasury address for social-wallet verification', async () => {
  const check = vi.spyOn(verify, 'isValidTransactionSignature').mockResolvedValue(true);
  const treasury = Ed25519Keypair.generate().toSuiAddress();
  const bytes = new Uint8Array([1]);
  await verifyTreasurySignature(bytes, 'social-wallet-signature', treasury, client);
  expect(check).toHaveBeenCalledWith(bytes, 'social-wallet-signature', { client, address: treasury });
});
it('reports network verification failures without exposing signature or provider details', async () => {
  vi.spyOn(verify, 'isValidTransactionSignature').mockRejectedValue(new Error('private provider details'));
  await expect(verifyTreasurySignature(new Uint8Array([1]), 'signature', Ed25519Keypair.generate().toSuiAddress(), client)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('No payment was submitted') });
});
