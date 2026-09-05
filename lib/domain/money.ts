export const U64_MAX = (1n << 64n) - 1n;
export function units(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('Invalid currency decimals.');
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value))
    throw new Error('Amounts must be non-negative decimal strings.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals)
    throw new Error(`Amount has more than ${decimals} decimal places.`);
  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount > U64_MAX) throw new Error('Amount exceeds the settlement limit.');
  return amount;
}
export function decimal(value: bigint | string, decimals: number): string {
  const n = BigInt(value);
  const sign = n < 0n ? '-' : '';
  const a = n < 0n ? -n : n;
  const s = a.toString().padStart(decimals + 1, '0');
  return (
    sign + (decimals ? s.slice(0, -decimals) + '.' + s.slice(-decimals) : s)
  );
}
export function display(value: string | bigint, decimals = 6): string {
  const [a, b] = decimal(value, decimals).split('.');
  return (
    a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (b ? '.' + b.slice(0, 2).padEnd(2, '0') : '')
  );
}
export function convert(amount: bigint, rate: string): bigint {
  const factor = units(rate, 8);
  return (amount * factor + 50_000_000n) / 100_000_000n;
}

export function difference(a: string, b: string) {
  return BigInt(a) - BigInt(b);
}
