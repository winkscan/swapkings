use anchor_lang::prelude::*;

#[constant]
pub const COUNTER_SEED: &[u8] = b"counter";

#[constant]
pub const HELLO_WORLD_LAMPORTS: u64 = 1;

#[constant]
pub const MAX_COUNT: u64 = 10;

#[constant]
pub const FEE_VAULT_AUTHORITY_SEED: &[u8] = b"fee_vault_authority";

#[constant]
pub const PLAYER_STATS_SEED: &[u8] = b"player_stats";

#[constant]
pub const GUILD_SEED: &[u8] = b"guild";

// Inert filler authorities for record_swap's guild_founder_wallet/
// referrer_wallet when this depositor has no guild/no referrer — never
// actually paid (the handler only transfers to these when current_guild/
// referrer is really set). Two SEPARATE seeds, deliberately distinct from
// each other and from FEE_VAULT_AUTHORITY_SEED: a real bug, hit live
// 2026-08-22, came from both fillers originally sharing fee_vault_authority
// itself — collapsing fee_vault_token_account, guild_founder_token_account,
// and referrer_token_account into the SAME address (all three are just
// "ATA of this authority for this mint") the moment either guild or
// referrer was inactive, which is the common case for most swaps. Anchor's
// own ConstraintDuplicateMutableAccount check rejects that outright
// (confirmed via a real failed mainnet swap's own logs, not guessed).
#[constant]
pub const GUILD_FILLER_SEED: &[u8] = b"guild_filler";
#[constant]
pub const REFERRER_FILLER_SEED: &[u8] = b"referrer_filler";

#[constant]
pub const REF_CODE_SEED: &[u8] = b"ref_code";

// Length of a claimed referral code, in bytes/ASCII chars. Not exposed via
// #[constant] (usize doesn't round-trip cleanly through the IDL) — mirrored
// manually in the frontend, same convention MIN_FEE_AMOUNT already uses for
// jupiter.ts's PLATFORM_FEE_BPS/MIN_FEE_AMOUNT mirrors.
pub const REFERRAL_CODE_LEN: usize = 7;

// Placeholder raw-token-unit minimum fee record_swap will accept — the real
// per-swap fee is a % of the real swap size (already net of the caller's own
// LUCK-tier discount), computed off-chain from the Jupiter quote. This is just
// a floor against a client passing a dust fee_amount to record a swap for free.
#[constant]
pub const MIN_FEE_AMOUNT: u64 = 1_000;

// Ceiling on `usd_cents` (whole cents) a single record_swap call can claim
// toward a wallet's cumulative_volume_cents (LUCK/RANK). Real audit finding,
// 2026-08-25: `usd_cents` is entirely client-reported with no on-chain
// verification it corresponds to `fee_amount`, the REAL token amount this
// same call transfers — the transfer itself is always real (nobody can fake
// where the actual money goes, confirmed against real mainnet transactions),
// but with no bound at all a single MIN_FEE_AMOUNT-sized (near-free) transfer
// could claim an arbitrarily large usd_cents, instantly maxing LUCK/RANK for
// pennies. A full fix (server-signed USD attestation, same ed25519
// introspection pattern as join_guild's ATTESTATION_SIGNER) was considered
// and rejected for this specific call: record_swap runs on EVERY swap, the
// most frequent action in the app, and making that path depend on the cache
// Worker being reachable is a worse tradeoff than the fraud it would close —
// gaming this only inflates a wallet's own displayed tier/stats, it can
// never redirect real funds (unlike join_guild's founder_wallet, which
// this constant intentionally doesn't mirror the fix pattern of). This
// ceiling instead bounds the worst single-shot case for free/on-chain, no
// oracle, no extra instruction, no new failure mode for real swaps — $50M in
// one swap is already far beyond any real usage this app has seen, so it
// never blocks a genuine large swap, but it forces farming the tier list to
// take many separate real (gas-costing) transactions instead of one.
#[constant]
pub const MAX_USD_CENTS_PER_SWAP: u64 = 5_000_000_000u64; // $50,000,000.00

// Same reasoning as MAX_USD_CENTS_PER_SWAP, applied to `fee_usd_e4` — the
// OTHER client-reported figure record_swap trusts, which drives a Guild's
// own public "total fees earned" counter on the Houses leaderboard rather
// than a wallet's LUCK/RANK. $1M of fee in one single swap is already an
// absurd real-world number (it'd imply a real swap size in the hundreds of
// millions even at the lowest possible fee bps), so this never blocks a
// genuine swap either.
#[constant]
pub const MAX_FEE_USD_E4_PER_SWAP: u64 = 10_000_000_000u64; // $1,000,000.00

// Placeholder treasury wallet — the platform's own take of every fee (the
// remainder after any guild/referrer share) ultimately lands here via
// sweep_fee. #[constant] so it lands in the IDL and the Anchor TS client can
// auto-resolve the founder_authority/founder_token_account accounts without
// the frontend having to pass them explicitly.
#[constant]
pub const FOUNDER_AUTHORITY: Pubkey = pubkey!("CJkDGjo7TdHdLgK3hyLkeSCgaYgoreh2DoUS9qupQuvf");

// Public half of a keypair whose PRIVATE half lives only as a secret in the
// swapkings-cache Cloudflare Worker (see cloudflare-worker/src/index.ts's
// /founder-attestation route) — never in this repo, never client-side.
// join_guild's founder_wallet used to be pure client input with no on-chain
// verification at all: real security review, 2026-08-25, confirmed anyone
// could call join_guild directly (bypassing the frontend entirely) for any
// token whose Guild PDA hadn't been created yet, with founder_wallet set to
// their OWN wallet — permanently hijacking up to 90% of every future
// member's swap fee on ANY of their swaps, for that token, forever (fund
// redirection to an attacker, not just a display bug). Reading pump.fun's
// own on-chain bonding-curve `creator` field was the first fix attempted,
// and rejected after verifying against two real mainnet tokens (UFD,
// Fartcoin): that field reads back as Pubkey::default() for both — it's
// only populated for tokens created after pump.fun added it, never
// backfilled for older ones, so it can't be trusted as the sole on-chain
// source for the token population this app actually needs to support today.
// This constant is the other half of the real fix: the cache Worker
// resolves a mint's real founder itself (on-chain when populated, Jupiter's
// token API `dev` field otherwise) and signs an Ed25519 message
// (mint(32) || founder_wallet(32)) attesting to it; join_guild.rs verifies
// that signature was actually checked by the native ed25519_program in the
// SAME transaction (via sysvar instruction introspection) before ever
// trusting founder_wallet on the instruction it's actually creating a new
// Guild with. A caller bypassing the frontend can no longer supply an
// arbitrary founder_wallet — without a real signature from this key, the
// whole transaction fails before join_guild's own logic even runs.
#[constant]
pub const ATTESTATION_SIGNER: Pubkey = pubkey!("HdiEzJP1eS2dmqbo8F1xZpnBTjDLhMZELJXMbwaasr2s");

// Share of a swap's (already-discounted) fee that routes straight to a
// guild's founder / a referrer, in bps out of 10_000 — instantly, in the same
// transaction as the swap. Whatever's left over is the platform's own share,
// swept later by sweep_fee. Four cases, all summing to 10_000:
//   no guild, no referrer  -> 100% platform
//   no guild, referrer     -> 50% referrer / 50% platform
//   guild, no referrer     -> 90% guild / 10% platform
//   guild + referrer       -> 40% guild / 50% referrer / 10% platform
// A referrer's own share is deliberately the SAME 50% whether or not the
// wallet they referred is in a guild — Alexey's explicit call: someone who
// put in the effort to bring a referral should earn the same either way, not
// less just because that wallet also happened to join a guild. The guild's
// share absorbs the difference (90% -> 40% once a referrer is also in the
// picture) rather than the referrer's.
#[constant]
pub const GUILD_FOUNDER_SHARE_BPS: u64 = 9_000;
#[constant]
pub const GUILD_FOUNDER_SHARE_WITH_REF_BPS: u64 = 4_000;
#[constant]
pub const REFERRER_SHARE_NO_GUILD_BPS: u64 = 5_000;
#[constant]
pub const REFERRER_SHARE_WITH_GUILD_BPS: u64 = 5_000;

// RANK tiers — thresholds are the integer-sqrt "Lucky Score" of cumulative swap
// volume in USD (keeps whales from scaling linearly with $). Constant names below
// are legacy from the original jackpot-odds design (TIER_SHARK_SCORE unlocks
// what the frontend now displays as "Lord", TIER_WHALE_SCORE unlocks
// "King" — kept as-is rather than renamed to avoid an otherwise-unnecessary
// program upgrade just for identifier names; see useRank.ts's TIERS for the
// actual user-facing names/emoji: Initiate/Adept/Veteran/Lord/King, renamed
// 2026-08-21 to fit the SwapKings + Houses theme — "Lord" replaced the
// original "Guildmaster" once Guilds itself was renamed to Houses). Drives a
// deterministic fee discount instead of jackpot odds, see PlayerStats::discount_bps.
#[constant]
pub const TIER_TRADER_SCORE: u64 = 71; // sqrt($5,000) -> Adept
#[constant]
pub const TIER_DEGEN_SCORE: u64 = 224; // sqrt($50,000) -> Veteran
#[constant]
pub const TIER_SHARK_SCORE: u64 = 708; // sqrt($500,000) -> Lord
#[constant]
pub const TIER_WHALE_SCORE: u64 = 2237; // sqrt($5,000,000) -> King

// Fee discount per tier, in bps out of 10_000 of the flat platform fee —
// Adept 12.5%, Veteran 25%, Lord 37.5%, King 50%. Capped at 50% (not
// 100%) deliberately: a 100% discount zeroes fee_amount completely, leaving
// nothing for record_swap to split with a guild/referrer even when both are
// set — Alexey's explicit call after noticing a top-tier wallet's
// referrer/guild would otherwise always earn $0. Capping at 50% guarantees
// there's always a real remainder to split, no matter how high a wallet's
// own tier climbs.
#[constant]
pub const TIER_DOLPHIN_DISCOUNT_BPS: u64 = 1_250;
#[constant]
pub const TIER_SHARK_DISCOUNT_BPS: u64 = 2_500;
#[constant]
pub const TIER_WHALE_DISCOUNT_BPS: u64 = 3_750;
#[constant]
pub const TIER_KRAKEN_DISCOUNT_BPS: u64 = 5_000;

// --- Legacy commit/reveal pool (retired) ---
// Kept only so sweep_legacy_pool can still derive the old pool vault's PDA and
// rescue the real (if small, ~$19 total) balances left in it now that
// reveal_swap — the only withdrawal path — no longer exists. No new value is
// ever routed here again; delete once every legacy mint has been swept.
#[constant]
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
