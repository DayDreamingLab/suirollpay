import { loadEnvFile } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { SuiGrpcClient } from '@mysten/sui/grpc';
loadEnvFile('../.env.local');
const e = process.env;
const client = new SuiGrpcClient({
  network: e.NEXT_PUBLIC_SUI_NETWORK,
  baseUrl: e.NEXT_PUBLIC_SUI_RPC_URL,
});
try {
  const [pkg, registry, cap, coin, bal] = await Promise.all([
    client.movePackageService.getPackage({
      packageId: e.NEXT_PUBLIC_PAYROLL_PACKAGE_ID,
    }).response,
    client.getObject({
      objectId: e.NEXT_PUBLIC_PAYROLL_REGISTRY_ID,
      include: { json: true },
    }),
    client.getObject({
      objectId: e.NEXT_PUBLIC_PAYROLL_ADMIN_CAP_ID,
      include: { json: true },
    }),
    client.core.getCoinMetadata({ coinType: e.NEXT_PUBLIC_USDC_TYPE }),
    client.getBalance({
      owner: e.PAYROLL_TREASURY_ADDRESS,
      coinType: e.NEXT_PUBLIC_USDC_TYPE,
    }),
  ]);
  const data = {
    modules: pkg.package.modules.map(
      ({ contents: _contents, ...rest }) => rest,
    ),
    registry: registry.object,
    cap: cap.object,
    coin,
    balance: bal.balance,
  };
  await writeFile(
    'docs/deployed-contract.json',
    JSON.stringify(
      data,
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  );
  console.log(
    JSON.stringify({
      modules: data.modules.map((x) => ({
        name: x.name,
        functions: x.functions.map((f) => f.name),
      })),
      registryType: registry.object.type,
      capOwnerMatches:
        cap.object.owner.AddressOwner === e.PAYROLL_TREASURY_ADDRESS,
      coin,
      balance: bal.balance,
    }),
  );
} catch (error) {
  console.log({ suiError: error.message?.slice(0, 300) });
}
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'GONKA_API_BASE_URL']) {
  try {
    const url = new URL(e[key]);
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log({ key, status: r.status });
  } catch (error) {
    console.log({ key, error: error.cause?.code || error.code || error.name });
  }
}
