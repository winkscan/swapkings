use anchor_lang::prelude::*;

use crate::constants::REFERRAL_CODE_LEN;

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

// One per wallet. Tracks cumulative swap volume (client-reported USD cents,
// same trust model the old commit_swap used for `amount`) that drives the
// LUCK tier / fee-discount ladder, which guild this wallet's fee currently
// routes to (self-selected, sticky until changed or left), and which wallet
// gets credit as this wallet's referrer (set once on first use, permanent).
#[account]
#[derive(InitSpace)]
pub struct PlayerStats {
    pub depositor: Pubkey,
    pub cumulative_volume_cents: u64,
    // Pubkey::default() (all-zero) means "not in a guild" — never a real
    // generated Guild PDA.
    pub current_guild: Pubkey,
    // Denormalized copy of Guild::founder_wallet at the moment this wallet
    // joined, so record_swap never has to load the Guild account just to know
    // where to route funds — only to bump its fee-earned counter, and even
    // that read is optional (see instructions/record_swap.rs).
    pub current_guild_founder_wallet: Pubkey,
    // Pubkey::default() means "no referrer yet" — set once, on whichever
    // record_swap call first supplies one, never overwritten after.
    pub referrer: Pubkey,
    // This wallet's own claimed referral code, all-zero bytes until claimed
    // (see instructions/claim_referral_code.rs). ASCII bytes only, never 0x00,
    // so all-zero is a safe "not claimed yet" sentinel.
    pub my_referral_code: [u8; REFERRAL_CODE_LEN],
    pub bump: u8,
    // Cumulative USD value (x 10,000 — see Guild::total_fees_earned_usd_e4's
    // own comment for why not whole cents) this wallet's OWN swaps have
    // routed to whoever referred it, over all time — bumped in
    // record_swap.rs alongside cumulative_volume_cents. Lives here (on the
    // referred wallet, not the referrer) so the Friends page can get every
    // referred friend's lifetime contribution in a single memcmp-filtered
    // getProgramAccounts call (`referrer == my wallet`), no per-friend
    // lookup or Helius history scan needed. Appended at the very end of the
    // struct, deliberately: any field added in the middle would misalign
    // every field that already had a fixed byte offset in already-created
    // accounts, and Anchor's `realloc` constraint alone can't rescue an
    // under-sized existing account (the typed Borsh deserialize happens
    // before realloc runs — verified directly against anchor-lang 1.1.2's
    // codegen). Existing accounts are migrated once via
    // instructions/migrate_player_stats.rs before this field is ever read
    // from them.
    pub earned_for_referrer_usd_e4: u64,
}

impl PlayerStats {
    // sqrt(volume in dollars), via integer sqrt of (cents / 100). This is the
    // "Lucky Score" shown in the UI and the value tier thresholds are compared
    // against.
    pub fn lucky_score(&self) -> u64 {
        isqrt(self.cumulative_volume_cents / 100)
    }

    // Deterministic fee-discount, in bps out of 10_000 — replaces the old
    // jackpot_multiplier. Same tier thresholds as before, no chance involved:
    // a wallet's tier waives a fixed, guaranteed slice of the platform fee,
    // applied client-side before fee_amount is even computed (see
    // swapExecutor.ts and instructions/record_swap.rs).
    pub fn discount_bps(&self) -> u64 {
        let score = self.lucky_score();
        if score >= crate::constants::TIER_WHALE_SCORE {
            crate::constants::TIER_KRAKEN_DISCOUNT_BPS
        } else if score >= crate::constants::TIER_SHARK_SCORE {
            crate::constants::TIER_WHALE_DISCOUNT_BPS
        } else if score >= crate::constants::TIER_DEGEN_SCORE {
            crate::constants::TIER_SHARK_DISCOUNT_BPS
        } else if score >= crate::constants::TIER_TRADER_SCORE {
            crate::constants::TIER_DOLPHIN_DISCOUNT_BPS
        } else {
            0
        }
    }
}

// One per Jupiter-tradeable, pump.fun-launched token that's cleared the
// market-cap floor (checked off-chain by the frontend before it ever offers a
// Join button — the program itself doesn't gate on market cap, it just trusts
// founder_wallet at join_guild time, same client-trust model already used
// throughout this program). Any wallet can freely join/leave — see
// instructions/join_guild.rs and leave_guild.rs.
#[account]
#[derive(InitSpace)]
pub struct Guild {
    pub token_mint: Pubkey,
    pub founder_wallet: Pubkey,
    pub member_count: u64,
    // USD value of fees routed to this guild's founder so far, x 10,000
    // (i.e. divide by 10,000 for real dollars — NOT cents, unlike
    // cumulative_volume_cents' x100). Deliberately higher precision: a
    // guild's share of a small swap's fee can be a fraction of a single
    // cent (e.g. a $4 test swap's 0.2% fee is $0.008, 90% of that is
    // $0.0072) — tracking in whole cents made record_swap's integer math
    // truncate this specific field to exactly $0.00 for every real mainnet
    // swap tested so far, even though the real token transfer it's meant to
    // describe was always correct (confirmed live 2026-08-22). A live
    // counter rather than something reconstructed from transaction logs, so
    // the Guilds page can read it straight off this account with no
    // event-scanning/backfill machinery at all.
    pub total_fees_earned_usd_e4: u64,
    pub bump: u8,
}

// Maps a short, human-shareable referral code to the wallet that claimed it.
// The code itself carries no information about the wallet (fully random,
// chosen client-side) — this account is the only place the mapping exists,
// enforced unique on-chain by `init` (claim_referral_code fails outright if
// the code's already taken, so the client just retries with a fresh one).
#[account]
#[derive(InitSpace)]
pub struct ReferralCode {
    pub owner: Pubkey,
    pub bump: u8,
}

// --- Legacy commit/reveal pool (retired) ---
// Kept only so sweep_legacy_pool can still deserialize the old pool vault's
// token account and rescue what's left in it. No longer written anywhere.
#[account]
#[derive(InitSpace)]
pub struct PoolEntry {
    pub mint: Pubkey,
    pub total_deposited: u64,
    pub bump: u8,
}

fn isqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}
