// Pure display/number helpers ported from app/src/format.ts. `solscanTxUrl` is
// simplified: mobile is always mainnet, so no cluster param is ever needed.

export function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

// Converts a human-typed amount (e.g. "0.2") to the raw base-unit integer
// string Jupiter's API expects, using the token's own decimals.
export function toRawUnits(humanAmount: string, decimals: number): string {
  const n = Number(humanAmount)
  if (!Number.isFinite(n) || n <= 0) return '0'
  return Math.round(n * 10 ** decimals).toString()
}

// Exact raw -> human, pure string math (no float drift) — used for the MAX
// button so a large balance round-trips back through toRawUnits without
// creeping past what's actually on-chain.
export function rawToHumanExact(raw: string, decimals: number): string {
  const neg = raw.startsWith('-')
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals) || '0'
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return (neg ? '-' : '') + (frac ? `${whole}.${frac}` : whole)
}

export function fromRawUnits(rawAmount: string, decimals: number): string {
  const n = Number(rawAmount)
  if (!Number.isFinite(n)) return '0'
  return Number((n / 10 ** decimals).toFixed(6)).toString()
}

export function formatUsdCompact(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value).toLocaleString('en-US')}`
  return `$${value.toFixed(2)}`
}

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '')
}

export function formatTokenAmountCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `${trimTrailingZero((amount / 1_000_000_000).toFixed(1))}b`
  if (amount >= 1_000_000) return `${trimTrailingZero((amount / 1_000_000).toFixed(1))}m`
  if (amount > 10_000) return `${trimTrailingZero((amount / 1_000).toFixed(1))}k`
  if (amount === 0) return '0'
  const decimals = amount < 1 ? 6 : amount < 100 ? 4 : 2
  return Number(amount.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export function solscanTxUrl(sig: string) {
  return `https://solscan.io/tx/${sig}`
}

export function solscanAddressUrl(address: string) {
  return `https://solscan.io/address/${address}`
}
