import { useEffect, useState } from 'react'
import { PublicKey, Transaction, type Connection } from '@solana/web3.js'
import type { AnchorWallet, WalletContextState } from '@solana/wallet-adapter-react'
import { getProgram } from './anchorClient'
import { readonlyWallet } from './readonlyWallet'
import { playerStatsPda, referralCodePda, randomReferralCode, referralCodeFromString, referralCodeToString } from './pdas'
import { wasCancelled } from './walletErrors'
import { confirmSignature } from './confirmTx'
import { normalizeSignature } from './signature'

const STORAGE_KEY = 'swapkings.pendingReferralCode.v1'

function readCachedCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeCachedCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Private browsing / storage disabled — the ?ref= link still works for
    // this page load, it just won't survive navigating away and back.
  }
}

// Captured once, on first load, from ?ref=<code> in the URL and cached in
// localStorage so it survives navigating around the app before the wallet's
// very first swap — the referral only actually gets written on-chain,
// permanently, the first time record_swap runs with it (see swapExecutor.ts).
// A wallet that already has a referrer just ignores this; record_swap itself
// is a no-op on the referrer_arg once one is already set.
export function usePendingReferralCode(): string | null {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')
    if (fromUrl) {
      writeCachedCode(fromUrl)
      setCode(fromUrl)
      return
    }
    setCode(readCachedCode())
  }, [])

  return code
}

// Resolves a referral code to the wallet that claimed it — one deterministic
// PDA read, no scanning. Returns null for an unclaimed/malformed code, same
// as having no referral link at all (swapExecutor just omits referrer_arg).
export async function resolveReferralCode(connection: Connection, code: string): Promise<PublicKey | null> {
  try {
    const program = getProgram(connection, readonlyWallet)
    const pda = referralCodePda(referralCodeFromString(code))
    const account = await program.account.referralCode.fetch(pda)
    return account.owner
  } catch {
    return null
  }
}

// Always points at the swap page, regardless of which page this is called
// from (ReferralCard lives on /friends) — that's the only route that reads
// ?ref= at all (see usePendingReferralCode, wired up in SwapPanel.tsx), so a
// link built from the current page's own path (e.g. /friends?ref=...) would
// silently never capture the code.
export function referralLink(code: string): string {
  const url = new URL(window.location.origin + '/')
  url.searchParams.set('ref', code)
  return url.toString()
}

const CLAIM_MAX_ATTEMPTS = 5

// Generates a fresh random code and tries to claim it — on-chain `init`
// guarantees uniqueness, so a collision just means "someone else already has
// this exact code" (astronomically rare at this code length), and the only
// right response is to try again with a different random code, not to fail
// outright.
export async function claimReferralCode(
  connection: Connection,
  wallet: AnchorWallet,
  sendTransaction: WalletContextState['sendTransaction'],
): Promise<string> {
  const program = getProgram(connection, wallet)

  for (let attempt = 1; attempt <= CLAIM_MAX_ATTEMPTS; attempt++) {
    const code = randomReferralCode()
    try {
      // `as any`: see the note in guildActions.ts on Anchor's ResolvedAccounts
      // typing limitation — field names verified against
      // claim_referral_code.rs's #[derive(Accounts)].
      const ix = await program.methods
        .claimReferralCode(Array.from(code))
        .accounts({
          depositor: wallet.publicKey,
          playerStats: playerStatsPda(wallet.publicKey),
          referralCode: referralCodePda(code),
        } as any)
        .instruction()

      const tx = new Transaction().add(ix)
      tx.feePayer = wallet.publicKey

      // Same two fixes applied to guildActions.ts's sendAndConfirm, 2026-08-22
      // (see that file's own comment for the full reasoning): pre-flight
      // simulate so a real failure surfaces its actual on-chain reason
      // instead of the wallet adapter's generic "Internal error" (no second
      // arg — legacy Transaction, this web3.js version rejects a config
      // object there), and actually checking confirmTransaction's own
      // `value.err` — left unchecked, a transaction that lands but reverts
      // on-chain (e.g. a genuine code collision slipping past simulation)
      // would otherwise read as a silent success and hand back a code that
      // was never actually claimed.
      const sim = await connection.simulateTransaction(tx)
      if (sim.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).slice(-8).join('\n')}`)
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      // normalizeSignature: see that function's own comment — some wallets
      // return this as base64 instead of the base58 confirmSignature's RPC
      // polling actually expects.
      const sig = normalizeSignature(await sendTransaction(tx, connection))
      // Manual polling, not connection.confirmTransaction() — see
      // confirmTx.ts's own comment for why that method can hang
      // indefinitely against an HTTP-only RPC endpoint like ours (confirmed
      // live 2026-08-25: this exact call is what got stuck on "Getting your
      // link…" even though the claim had actually already gone through).
      await confirmSignature(connection, sig, lastValidBlockHeight)

      return referralCodeToString(code)
    } catch (err) {
      // The retry loop exists ONLY for a genuine on-chain code collision
      // (astronomically rare, but `init` guarantees it fails outright rather
      // than silently overwriting) — a wallet rejection isn't that, and
      // retrying it just re-prompts the wallet again with a new code,
      // silently, up to 5 times. Confirmed live 2026-08-25: clicking Cancel
      // in the wallet looked like it did nothing, because it did — the next
      // attempt's prompt replaced it immediately. Any other real failure
      // (RPC error, simulation failure) isn't a collision either and
      // shouldn't burn through 5 signature prompts before surfacing.
      if (wasCancelled(err) || attempt === CLAIM_MAX_ATTEMPTS) throw err
      console.warn(`Referral code claim collided (attempt ${attempt}), retrying with a new code:`, err)
    }
  }
  throw new Error('Could not claim a referral code after several attempts')
}
