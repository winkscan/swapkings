import { PublicKey, type Connection } from '@solana/web3.js'
import type { AnchorWallet } from '@solana/wallet-adapter-react'
import { getProgram } from './anchorClient'
import { playerStatsPda, ZERO_PUBKEY } from './pdas'

// One shared shape for everything PlayerStats drives: RANK tier/discount
// (LuckyScoreCard), which guild a wallet's fee currently routes to and its
// referrer (GuildsPage, ReferralCard), and the wallet's own claimed referral
// code. A brand-new wallet with no PlayerStats account yet reads as all-zero/
// empty rather than throwing, same trust model the rest of this app uses for
// "hasn't done X on-chain yet".
export interface PlayerStatsData {
  cumulativeVolumeCents: number
  currentGuild: PublicKey
  currentGuildFounderWallet: PublicKey
  referrer: PublicKey
  myReferralCode: number[]
}

export const EMPTY_PLAYER_STATS: PlayerStatsData = {
  cumulativeVolumeCents: 0,
  currentGuild: ZERO_PUBKEY,
  currentGuildFounderWallet: ZERO_PUBKEY,
  referrer: ZERO_PUBKEY,
  myReferralCode: [],
}

export async function fetchPlayerStats(connection: Connection, wallet: AnchorWallet): Promise<PlayerStatsData> {
  const program = getProgram(connection, wallet)
  try {
    const stats = await program.account.playerStats.fetch(playerStatsPda(wallet.publicKey))
    return {
      cumulativeVolumeCents: Number(stats.cumulativeVolumeCents.toString()),
      currentGuild: stats.currentGuild,
      currentGuildFounderWallet: stats.currentGuildFounderWallet,
      referrer: stats.referrer,
      myReferralCode: stats.myReferralCode,
    }
  } catch (err) {
    // Anchor's own message for a genuinely nonexistent account — the real
    // "hasn't done X on-chain yet" case this fallback exists for. A REAL bug,
    // confirmed live 2026-09-11 on the mobile port of this exact function:
    // this bare catch also swallowed a transient fetch failure for a wallet
    // that actually HAS a guild + referrer set on-chain, silently returning
    // EMPTY_PLAYER_STATS — swapExecutor.ts then built record_swap with
    // guild_filler/referrer_filler instead of the wallet's real guild
    // founder/referrer, and the swap died on-chain with a ConstraintAddress
    // error on guild_founder_wallet instead of failing clearly (or just
    // retrying — see executeSwap's own retry-once wrapper, which this rethrow
    // now actually reaches). Applying the same fix here since the bug is in
    // shared logic, not mobile-specific — any error OTHER than "account
    // doesn't exist" must propagate, not silently look like an empty wallet.
    const msg = err instanceof Error ? err.message : String(err)
    if (/account does not exist/i.test(msg)) {
      return EMPTY_PLAYER_STATS
    }
    throw err
  }
}

// Mirrors PlayerStats::discount_bps in the Rust program (constants.rs's
// TIER_*_SCORE / TIER_*_DISCOUNT_BPS) — same duplication convention already
// used for PLATFORM_FEE_BPS/MIN_FEE_AMOUNT in jupiter.ts.
export function discountBpsForScore(score: number): number {
  if (score >= 2237) return 5_000 // Kraken
  if (score >= 708) return 3_750 // Whale
  if (score >= 224) return 2_500 // Shark
  if (score >= 71) return 1_250 // Dolphin
  return 0 // Shrimp
}

function isqrt(n: number) {
  if (n <= 0) return 0
  return Math.floor(Math.sqrt(n))
}

// discountBpsForScore, starting from raw volume cents instead of an
// already-computed score — what swapExecutor.ts needs at swap-build time.
export function discountBpsForVolumeCents(cents: number): number {
  return discountBpsForScore(isqrt(cents / 100))
}
