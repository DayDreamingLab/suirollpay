import type { PublicConfig } from '../domain/types';
function env(key: string, fallback = '') {
  return process.env[key]?.trim() || fallback;
}
export function config(): PublicConfig {
  const network = env('NEXT_PUBLIC_SUI_NETWORK', 'testnet');
  if (!['testnet', 'mainnet', 'devnet'].includes(network))
    throw new Error('Unsupported Sui network.');
  return {
    supabaseUrl: env('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseKey: env(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    ),
    network: network as PublicConfig['network'],
    rpcUrl: env(
      'NEXT_PUBLIC_SUI_RPC_URL',
      `https://fullnode.${network}.sui.io:443`,
    ),
    packageId: env(
      'NEXT_PUBLIC_PAYROLL_PACKAGE_ID',
      env('NEXT_PUBLIC_SUIROLL_PACKAGE_ID'),
    ),
    registryId: env(
      'NEXT_PUBLIC_PAYROLL_REGISTRY_ID',
      env('NEXT_PUBLIC_SUIROLL_REGISTRY_ID'),
    ),
    adminCapId: env(
      'NEXT_PUBLIC_PAYROLL_ADMIN_CAP_ID',
      env('SUIROLL_ADMIN_CAP_ID'),
    ),
    coinType: env('NEXT_PUBLIC_USDC_TYPE', env('NEXT_PUBLIC_USDC_COIN_TYPE')),
    decimals: Number(env('NEXT_PUBLIC_USDC_DECIMALS', '6')),
    treasury: env('PAYROLL_TREASURY_ADDRESS'),
  };
}
export function aiConfig() {
  return {
    baseUrl: env('GONKA_API_BASE_URL'),
    key: env('GONKA_API_KEY'),
    model: env('GONKA_MODEL'),
    timeout: Math.min(Number(env('AI_REQUEST_TIMEOUT_MS', '45000')), 90000),
    retries: Math.min(Number(env('AI_MAX_RETRIES', '2')), 3),
    maxTokens: Math.min(Number(env('AI_MAX_OUTPUT_TOKENS', '1500')), 4000),
  };
}
