import bs58 from 'bs58'

// @solana-mobile/wallet-adapter-mobile v2.2.9 has a real bug — confirmed
// directly against its own source (lib/cjs/index.browser.js's
// sendTransaction): when the connected wallet declares the modern Wallet
// Standard `SolanaSignAndSendTransaction` feature (Phantom does), the
// adapter returns the signature as base64
// (`base64FromUint8Array(output.signature)`), not the base58 string every
// other wallet-adapter implementation returns and that `TransactionSignature`
// is documented to be. Confirmed live 2026-08-27: a real successful swap's
// on-chain signature (EQ7Hjo...zrzn, verified via direct RPC lookup) shared
// nothing with what sendTransaction() actually returned to us — a base64
// string ending in "==", shown in the success modal as "C43I...Aw==".
// Solscan links built from that raw value are silently broken, and
// connection.getSignatureStatuses() (see confirmTx.ts) expects base58, so
// any confirmation polling keyed on the raw value would silently never
// match either — the swap/action itself still succeeds (the wallet's own
// send path doesn't depend on this return value), only our own display and
// polling do.
//
// Normalizes whatever a wallet's sendTransaction()/similar actually
// returned into a real base58 signature before we display or poll for it —
// a harmless no-op for every wallet that already returns base58 correctly.
export function normalizeSignature(raw: string): string {
  if (isValidBase58Signature(raw)) return raw
  try {
    const bytes = Buffer.from(raw, 'base64')
    if (bytes.length === 64) return bs58.encode(bytes)
  } catch {
    // fall through — return the raw value below rather than throwing over
    // what's ultimately just a display/polling concern.
  }
  return raw
}

function isValidBase58Signature(value: string): boolean {
  try {
    return bs58.decode(value).length === 64
  } catch {
    return false
  }
}
