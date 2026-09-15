export function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

// Converts a human-typed amount (e.g. "0.2") to the raw base-unit integer string
// Jupiter's API actually expects, using the token's own decimals — SOL has 9,
// USDC has 6, etc. Without this, a user typing "0.2" (meaning 0.2 SOL) would
// send a literal "0.2" to Jupiter's quote endpoint, which rejects non-integers.
export function toRawUnits(humanAmount: string, decimals: number): string {
  const n = Number(humanAmount)
  if (!Number.isFinite(n) || n <= 0) return '0'
  return Math.round(n * 10 ** decimals).toString()
}

// Same conversion as fromRawUnits, but exact — pure string/BigInt math, no
// floating point at all. fromRawUnits' float division is fine for display,
// but for a "MAX" button the amount round-trips back through toRawUnits
// (human -> float -> raw) before being sent as the swap amount, and that
// float round-trip can drift a large balance (e.g. a meme-coin's raw amount
// in the billions) up past what's actually on-chain, failing the swap.
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
  // Cap at 6 decimal places and drop trailing zeros — raw division can otherwise
  // produce long floating-point tails (e.g. 0.000129785...) that read as noise.
  return Number((n / 10 ** decimals).toFixed(6)).toString()
}

// Keeps USD stats to ~6 digits so they fit on a mobile-width screen:
// small values keep cents ($0.00, $42.50), mid values drop cents and add
// thousand separators ($100,000), and anything at/above $1M compresses to
// one decimal with an M suffix ($1.2M).
export function formatUsdCompact(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${Math.round(value).toLocaleString('en-US')}`
  }
  return `$${value.toFixed(2)}`
}

// Compact display for a raw token quantity (not a dollar amount) — meme-coin
// pools can hold amounts in the millions/billions where a full number would
// blow out the row, so anything past 10,000 collapses to a k/m/b suffix.
// Below that, shows a plain, comma-grouped number with just enough decimals to
// stay meaningful (fewer as the amount gets bigger, so $0.01-ish balances don't
// just read as "0").
export function formatTokenAmountCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `${trimTrailingZero((amount / 1_000_000_000).toFixed(1))}b`
  if (amount >= 1_000_000) return `${trimTrailingZero((amount / 1_000_000).toFixed(1))}m`
  if (amount > 10_000) return `${trimTrailingZero((amount / 1_000).toFixed(1))}k`
  if (amount === 0) return '0'
  const decimals = amount < 1 ? 6 : amount < 100 ? 4 : 2
  return Number(amount.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '')
}

// Local validator needs Solscan's "custom cluster" mode pointed at it explicitly;
// a real devnet/mainnet RPC (see main.tsx's VITE_RPC_ENDPOINT) just needs the
// matching ?cluster= param, or none at all for mainnet (Solscan's default).
export function solscanTxUrl(sig: string) {
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT as string | undefined
  if (!endpoint || endpoint.includes('127.0.0.1') || endpoint.includes('localhost')) {
    return `https://solscan.io/tx/${sig}?cluster=custom&customUrl=http://127.0.0.1:8899`
  }
  const cluster = import.meta.env.VITE_CLUSTER as string | undefined
  return cluster && cluster !== 'mainnet-beta'
    ? `https://solscan.io/tx/${sig}?cluster=${cluster}`
    : `https://solscan.io/tx/${sig}`
}

// Same cluster logic as solscanTxUrl, for a wallet/mint address page instead
// of a transaction — used to link out a Guild's token contract / founder
// wallet on the Guilds page.
export function solscanAddressUrl(address: string) {
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT as string | undefined
  if (!endpoint || endpoint.includes('127.0.0.1') || endpoint.includes('localhost')) {
    return `https://solscan.io/account/${address}?cluster=custom&customUrl=http://127.0.0.1:8899`
  }
  const cluster = import.meta.env.VITE_CLUSTER as string | undefined
  return cluster && cluster !== 'mainnet-beta'
    ? `https://solscan.io/account/${address}?cluster=${cluster}`
    : `https://solscan.io/account/${address}`
}
