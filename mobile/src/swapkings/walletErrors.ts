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
// right after switching to the Crews page and back. Detected via the
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
// back to the raw message otherwise — on web, full technical detail also
// lands in the browser console (see swapExecutor.ts's own console.error), so
// nothing is lost for debugging there.
//
// On mobile there is no equivalent console the tester can pull up — a
// `preview`-profile build has no redbox/LogBox for an uncaught error, and
// asking a non-programmer to `adb logcat` isn't realistic — so the on-screen
// message is genuinely the ONLY diagnostic channel available. TEMPORARY
// while bringing the mobile port up: append a short stack trace so a
// screenshot of the error is enough to actually debug it, instead of
// guessing blind from a bare "undefined is not a function". Remove once the
// mobile swap/guild/referral flows are verified stable.
export function friendlyErrorMessage(err: unknown): string {
  if (wasCancelled(err)) {
    // A real bug, confirmed live 2026-09-11: MWA surfaces a rejected/
    // cancelled signature as a Java `CancellationException` (message
    // literally contains "Cancellation"), which wasCancelled() already
    // recognized — but this function never checked it, so cancelling a
    // swap in the wallet dumped the raw exception + full stack on screen
    // instead of a calm "cancelled" message. The user's own choice isn't a
    // failure worth a stack trace.
    return 'Swap cancelled.'
  }
  if (wasSlippageExceeded(err)) {
    return 'The price moved before your swap could go through. Please try again.'
  }
  const message = err instanceof Error ? err.message : String(err)
  // Borsh's struct decoder recurses one "decode" frame per field, so a
  // 6-line cap cut off before reaching the actual innermost failing call —
  // confirmed live 2026-09-11 (a real crash's screenshot showed 6 identical-
  // looking "at decode" lines and nothing else). Show the whole thing.
  const stack = err instanceof Error && err.stack ? `\n${err.stack}` : ''
  return message + stack
}
