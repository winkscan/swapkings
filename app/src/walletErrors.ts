// A wallet-rejected signature reads as "Cancelled" (the user's own choice);
// anything else (RPC error, on-chain program error, etc.) reads as "Failed" (the
// transaction actually tried and didn't work).
export function wasCancelled(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /reject|cancel|denied/i.test(msg)
}

// Jupiter's own aggregator program throws its custom error 6001
// ("SlippageToleranceExceeded") when the real execution price at send time
// has drifted past the quote's allowed tolerance — common after navigating
// away and back before hitting Swap, or just real market movement between
// quote and send. Confirmed live 2026-08-22: a real swap failed this way
// right after switching to the Houses page and back. Detected via the
// Jupiter program ID + the exact hex code appearing together in the
// simulation logs bundled into swapExecutor.ts's error message — the bare
// error number 6001 alone isn't a reliable signal, since our own program
// happens to reuse that same numeric slot for an unrelated, effectively
// dead scaffold error (CounterOverflow) that a swap could never actually
// trigger, but "same number" is still worth not trusting blindly.
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'

function wasSlippageExceeded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes(JUPITER_PROGRAM_ID) && msg.includes('0x1771')
}

// Turns a raw thrown error into something a non-technical user can actually
// act on, for the small set of cases worth recognizing specifically. Falls
// back to the raw message otherwise — full technical detail (program logs,
// error codes) always lands in the browser console too (see
// swapExecutor.ts's own console.error), so nothing is lost for debugging,
// it's just not what's shown as the primary on-screen message.
export function friendlyErrorMessage(err: unknown): string {
  if (wasSlippageExceeded(err)) {
    return 'The price moved before your swap could go through. Please try again.'
  }
  return err instanceof Error ? err.message : String(err)
}
