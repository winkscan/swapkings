import { PublicKey, type Connection } from '@solana/web3.js'
import { playerStatsPda, ZERO_PUBKEY } from './pdas'
import { decodePlayerStats } from './accountDecode'

// One shared shape for everything PlayerStats drives: RANK tier/discount
// (RankCard), which guild a wallet's fee currently routes to and its
// referrer (HousesScreen, ReferralCard), and the wallet's own claimed
// referral code. A brand-new wallet with no PlayerStats account yet reads as
// all-zero/empty rather than throwing, same trust model the rest of this app
// uses for "hasn't done X on-chain yet".
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

export async function fetchPlayerStats(
  connection: Connection,
  owner: PublicKey,
): Promise<PlayerStatsData> {
  // Manual decode (see accountDecode.ts's own comment for why this doesn't
  // go through @coral-xyz/anchor's coder anymore) — a real Hermes-only crash
  // in that coder's decode chain, confirmed live 2026-09-11.
  const info = await connection.getAccountInfo(playerStatsPda(owner))
  if (!info) {
    // No PlayerStats yet — this wallet hasn't recorded a swap / joined a
    // guild / claimed a code. The real "hasn't done X on-chain yet" case
    // this fallback exists for.
    return EMPTY_PLAYER_STATS
  }
  const stats = decodePlayerStats(info.data)
  return {
    cumulativeVolumeCents: stats.cumulativeVolumeCents,
    currentGuild: stats.currentGuild,
    currentGuildFounderWallet: stats.currentGuildFounderWallet,
    referrer: stats.referrer,
    myReferralCode: stats.myReferralCode,
  }
}

// Mirrors PlayerStats::discount_bps in the Rust program (constants.rs's
// TIER_*_SCORE / TIER_*_DISCOUNT_BPS) — same duplication convention already
// used for PLATFORM_FEE_BPS/MIN_FEE_AMOUNT in jupiter.ts.
export function discountBpsForScore(score: number): number {
  if (score >= 2237) return 5_000 // Kraken / King
  if (score >= 708) return 3_750 // Whale / Lord
  if (score >= 224) return 2_500 // Shark / Veteran
  if (score >= 71) return 1_250 // Dolphin / Adept
  return 0 // Shrimp / Initiate
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
