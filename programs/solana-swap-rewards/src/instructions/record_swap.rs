use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
// token_interface types accept an account owned by either the classic SPL
// Token program or Token-2022 (`Interface<TokenInterface>` accepts either
// program's own ID) — a plain token::{Mint,TokenAccount,Token} would reject
// any Token-2022 mint outright with AccountOwnedByWrongProgram, confirmed
// live against a real Token-2022 pump.fun token (ANSEM). transfer_checked
// (mint + decimals) replaces plain transfer because Token-2022's transfer-fee/
// transfer-hook extensions require it — the classic Token program supports
// the checked variant identically, so this is a safe no-op change for
// classic-Token mints too.
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{constants::*, error::ErrorCode, state::{Guild, PlayerStats}};

#[derive(Accounts)]
#[instruction(usd_cents: u64, fee_amount: u64, fee_usd_e4: u64, referrer_arg: Pubkey)]
pub struct RecordSwap<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [PLAYER_STATS_SEED, depositor.key().as_ref()],
        bump,
    )]
    pub player_stats: Account<'info, PlayerStats>,

    // Fee-paying token — the swap's own output mint, so the fee comes straight
    // out of tokens the depositor just received earlier in the same
    // transaction. Boxed (along with every other InterfaceAccount below) —
    // token_2022::state::Account's extension-aware deserialization makes each
    // one big enough that this instruction's account validation blew Solana's
    // 4096-byte stack frame limit by a few bytes without boxing (confirmed:
    // `anchor build` itself reported the exact overflow) — a pointer on the
    // stack instead of the full struct is the standard fix.
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = depositor,
        associated_token::token_program = token_program,
    )]
    pub depositor_fee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA authority over the platform's own fee vault; holds no data of its own.
    #[account(seeds = [FEE_VAULT_AUTHORITY_SEED], bump)]
    pub fee_vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = fee_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub fee_vault_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: inert filler authority when this depositor has no guild — must
    /// be distinct from fee_vault_authority and referrer_filler (see
    /// constants.rs's own comment on GUILD_FILLER_SEED for why: reusing
    /// fee_vault_authority here used to collapse three separate token
    /// accounts into one and crash every swap with no guild/no referrer).
    #[account(seeds = [GUILD_FILLER_SEED], bump)]
    pub guild_filler: UncheckedAccount<'info>,

    /// CHECK: must equal player_stats.current_guild_founder_wallet once a guild
    /// is joined, or guild_filler as inert filler before any guild is joined —
    /// the handler only ever transfers to this account when current_guild is
    /// actually set, so the filler case never gets paid regardless of what's
    /// passed.
    #[account(
        address = if player_stats.current_guild != Pubkey::default() { player_stats.current_guild_founder_wallet } else { guild_filler.key() }
    )]
    pub guild_founder_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = guild_founder_wallet,
        associated_token::token_program = token_program,
    )]
    pub guild_founder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: inert filler authority when this depositor has no referrer —
    /// deliberately a DIFFERENT seed from guild_filler; see that field's own
    /// comment for why they can't share one.
    #[account(seeds = [REFERRER_FILLER_SEED], bump)]
    pub referrer_filler: UncheckedAccount<'info>,

    /// CHECK: must equal player_stats.referrer once one is set, OR the
    /// referrer_arg this very call is about to set it to for the first time
    /// (see handle_record_swap's referrer-assignment guard below), OR
    /// referrer_filler as inert filler when neither applies. The referrer_arg
    /// branch is required because Anchor validates every account constraint
    /// BEFORE the handler body runs — reading only player_stats.referrer here
    /// would still see the pre-call default value on a wallet's very first
    /// swap after following a referral link, misdirecting that swap's own
    /// referrer payout into referrer_filler instead of the real referrer
    /// (confirmed against a real mainnet transaction, 2026-08-22 — the payout
    /// landed at the referrer_filler PDA instead of the referrer's wallet).
    /// Mirrors the handler's own `referrer_arg != Pubkey::default() &&
    /// referrer_arg != depositor_key` guard so a self-referral attempt still
    /// falls through to the filler here too.
    #[account(
        address = if player_stats.referrer != Pubkey::default() {
            player_stats.referrer
        } else if referrer_arg != Pubkey::default() && referrer_arg != depositor.key() {
            referrer_arg
        } else {
            referrer_filler.key()
        }
    )]
    pub referrer_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = referrer_wallet,
        associated_token::token_program = token_program,
    )]
    pub referrer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    // Only actually read/mutated (fee-earned counter bump) when the depositor
    // is in a guild — Option so a depositor with no guild can simply omit it.
    // Fund routing itself never depends on this account (see
    // guild_founder_wallet/current_guild_founder_wallet above), only the
    // Guilds page's live fees-earned display does.
    #[account(mut)]
    pub guild: Option<Account<'info, Guild>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// Replaces the old commit_swap. One real, on-chain-enforced fee transfer (or
// up to three, if the depositor is in a guild and/or has a referrer) out of
// the depositor's own output-mint ATA — the price of counting this swap
// toward Lucky Score. No CPI into Jupiter itself: the client still assembles
// Jupiter's swap instruction + this one in a single atomic transaction, and
// the depositor pays out of the output tokens that swap just landed in their
// wallet.
//
// `fee_amount` already has the depositor's own LUCK-tier discount applied
// client-side (see swapExecutor.ts / PlayerStats::discount_bps) — this
// instruction only ever splits what it's given, never recomputes the fee
// itself. `usd_cents` (swap volume, whole cents) and `fee_usd_e4` (USD value
// of fee_amount, x 10,000 — see Guild::total_fees_earned_usd_e4's own
// comment for why this one needs finer precision than whole cents) are both
// client-reported, same trust model this program has always used for
// on-chain USD figures.
//
// `referrer_arg` is a no-op after the very first call that supplies one:
// referrer attribution is permanent by design, so a wallet's referrer is only
// ever set once and never overwritten.
pub fn handle_record_swap(
    ctx: Context<RecordSwap>,
    usd_cents: u64,
    fee_amount: u64,
    fee_usd_e4: u64,
    referrer_arg: Pubkey,
) -> Result<()> {
    // fee_amount == 0 is allowed through: a wallet's own tier discount is
    // applied client-side before this is even called (see swapExecutor.ts),
    // so a legitimate 0 here just means every downstream transfer below is
    // skipped (`if amount > 0`) — the volume/RANK bump at the bottom still
    // has to happen, or a wallet's lifetime volume would silently stop
    // growing forever once fee_amount ever landed on exactly 0. The floor
    // only guards against a *nonzero-but-dust* fee_amount, which is what
    // would let a client record free/near-free swaps to farm RANK.
    require!(fee_amount == 0 || fee_amount >= MIN_FEE_AMOUNT, ErrorCode::FeeTooSmall);
    // Real audit finding, 2026-08-25: usd_cents/fee_usd_e4 are pure
    // client-reported numbers with no on-chain link to fee_amount (the real
    // token transfer below) — see MAX_USD_CENTS_PER_SWAP's own comment for
    // why a full price-oracle fix wasn't worth it for this specific call.
    // These ceilings bound the worst single-call abuse for free.
    require!(usd_cents <= MAX_USD_CENTS_PER_SWAP, ErrorCode::UsdCentsTooLarge);
    require!(fee_usd_e4 <= MAX_FEE_USD_E4_PER_SWAP, ErrorCode::UsdCentsTooLarge);

    let depositor_key = ctx.accounts.depositor.key();
    let player_stats = &mut ctx.accounts.player_stats;
    player_stats.depositor = depositor_key;
    player_stats.bump = ctx.bumps.player_stats;

    if player_stats.referrer == Pubkey::default()
        && referrer_arg != Pubkey::default()
        && referrer_arg != depositor_key
    {
        player_stats.referrer = referrer_arg;
    }

    let has_guild = player_stats.current_guild != Pubkey::default();
    let has_referrer = player_stats.referrer != Pubkey::default();
    let (guild_bps, referrer_bps) = fee_split_bps(has_guild, has_referrer);

    let (guild_amount, referrer_amount, platform_amount) = split_fee(fee_amount, guild_bps, referrer_bps);

    let decimals = ctx.accounts.mint.decimals;

    if guild_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.depositor_fee_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.guild_founder_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            guild_amount,
            decimals,
        )?;
    }

    if referrer_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.depositor_fee_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.referrer_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            referrer_amount,
            decimals,
        )?;
    }

    if platform_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.depositor_fee_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.fee_vault_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            platform_amount,
            decimals,
        )?;
    }

    player_stats.cumulative_volume_cents = player_stats
        .cumulative_volume_cents
        .checked_add(usd_cents)
        .ok_or(ErrorCode::VolumeOverflow)?;

    if referrer_amount > 0 {
        // Lives on THIS wallet's own PlayerStats (the swiper's, not the
        // referrer's) — see state.rs's field comment for why: it lets the
        // Friends page read every referred friend's lifetime contribution in
        // one memcmp-filtered getProgramAccounts call keyed on `referrer`,
        // no per-referrer aggregation or off-chain history scan needed.
        let referrer_usd_e4 = ((fee_usd_e4 as u128) * (referrer_bps as u128) / 10_000) as u64;
        player_stats.earned_for_referrer_usd_e4 = player_stats
            .earned_for_referrer_usd_e4
            .checked_add(referrer_usd_e4)
            .ok_or(ErrorCode::FeeOverflow)?;
    }

    if let Some(guild) = ctx.accounts.guild.as_mut() {
        require_keys_eq!(guild.key(), player_stats.current_guild, ErrorCode::GuildMismatch);
        let guild_usd_e4 = ((fee_usd_e4 as u128) * (guild_bps as u128) / 10_000) as u64;
        guild.total_fees_earned_usd_e4 = guild
            .total_fees_earned_usd_e4
            .checked_add(guild_usd_e4)
            .ok_or(ErrorCode::FeeOverflow)?;
    }

    msg!(
        "Recorded swap for {}: fee {} (guild {}, referrer {}, platform {}), lucky score now {}",
        depositor_key,
        fee_amount,
        guild_amount,
        referrer_amount,
        platform_amount,
        player_stats.lucky_score()
    );

    Ok(())
}

// The 4-case bps table itself — shared by split_fee (real token amounts)
// and handle_record_swap's own fee_usd_e4 split just below (the Guild/
// Friends-page "fees earned" stats, computed off the client-reported USD
// value rather than the real transfer amount). Kept as one single source of
// truth so the two splits can never drift apart from each other.
fn fee_split_bps(has_guild: bool, has_referrer: bool) -> (u64, u64) {
    match (has_guild, has_referrer) {
        (true, true) => (GUILD_FOUNDER_SHARE_WITH_REF_BPS, REFERRER_SHARE_WITH_GUILD_BPS),
        (true, false) => (GUILD_FOUNDER_SHARE_BPS, 0),
        (false, true) => (0, REFERRER_SHARE_NO_GUILD_BPS),
        (false, false) => (0, 0),
    }
}

// Pulled out of handle_record_swap as its own pure function specifically so
// it can be property-tested in isolation (see the proptest module below)
// without needing a full LiteSVM/Anchor context — this is the one piece of
// this instruction that moves real money on every single swap, so it's the
// highest-value place to fuzz across the *entire* u64 input space rather
// than just the handful of real transactions manually checked against it on
// 2026-08-25. Returns (guild_amount, referrer_amount, platform_amount),
// always summing to exactly `fee_amount` — see the proptest conservation
// check for why that's guaranteed (guild_bps + referrer_bps <= 10_000 for
// every pair fee_split_bps can return, and integer division only ever
// rounds each share down, never up, so their sum can never exceed
// fee_amount).
fn split_fee(fee_amount: u64, guild_bps: u64, referrer_bps: u64) -> (u64, u64, u64) {
    let guild_amount = ((fee_amount as u128) * (guild_bps as u128) / 10_000) as u64;
    let referrer_amount = ((fee_amount as u128) * (referrer_bps as u128) / 10_000) as u64;
    let platform_amount = fee_amount - guild_amount - referrer_amount;

    (guild_amount, referrer_amount, platform_amount)
}

#[cfg(test)]
mod fee_split_proptests {
    use super::{fee_split_bps, split_fee};
    use proptest::prelude::*;

    proptest! {
        // The one invariant that actually matters here: the three shares
        // this instruction transfers real tokens for must always sum back
        // to exactly what the depositor was charged — no dust created out
        // of thin air, none silently lost. Runs against the FULL u64 range
        // for fee_amount (including 0 and u64::MAX, not just realistic swap
        // sizes) and all 4 real guild/referrer combinations (via
        // fee_split_bps, the same table handle_record_swap itself calls).
        #[test]
        fn shares_always_sum_to_fee_amount(
            fee_amount: u64,
            has_guild: bool,
            has_referrer: bool,
        ) {
            let (guild_bps, referrer_bps) = fee_split_bps(has_guild, has_referrer);
            let (guild, referrer, platform) = split_fee(fee_amount, guild_bps, referrer_bps);
            // u64 addition here would itself panic-on-overflow in a debug
            // build if this invariant were ever violated — using u128 keeps
            // the assertion itself panic-proof so a real violation shows up
            // as a clean assert failure, not a confusing overflow panic.
            let sum = guild as u128 + referrer as u128 + platform as u128;
            prop_assert_eq!(sum, fee_amount as u128);
        }

        // Same conservation property, but fuzzing guild_bps/referrer_bps
        // directly across the full 0..=10_000 range rather than only the 4
        // real combos — guards split_fee itself against a *future* bps
        // table edit (e.g. a new tier) introducing a pair that sums past
        // 10_000, not just today's known-safe values.
        #[test]
        fn shares_sum_to_fee_amount_for_any_valid_bps_pair(
            fee_amount: u64,
            guild_bps in 0u64..=10_000,
            referrer_bps in 0u64..=10_000,
        ) {
            // Rejection-filter to only the pairs split_fee's caller is ever
            // actually able to produce (fee_split_bps never returns a pair
            // summing past 10_000) — the case that matters is covered
            // separately below without this filter, deliberately, as a
            // guard against a future bps-table edit breaking that
            // assumption.
            prop_assume!(guild_bps + referrer_bps <= 10_000);
            let (guild, referrer, platform) = split_fee(fee_amount, guild_bps, referrer_bps);
            let sum = guild as u128 + referrer as u128 + platform as u128;
            prop_assert_eq!(sum, fee_amount as u128);
        }

        // guild_amount + referrer_amount must never exceed fee_amount —
        // split_fee's own platform_amount subtraction would otherwise
        // underflow (panicking in a debug/test build, wrapping silently in
        // release). guild_bps + referrer_bps <= 10_000 in every real
        // combination makes this true by construction, but that's exactly
        // the kind of assumption worth fuzzing rather than trusting — the
        // u128 comparison here can't itself overflow even if the invariant
        // were somehow violated, so a real violation shows up as a clean
        // assertion failure rather than a second, confusing panic.
        #[test]
        fn guild_plus_referrer_never_exceeds_fee(
            fee_amount: u64,
            has_guild: bool,
            has_referrer: bool,
        ) {
            let (guild_bps, referrer_bps) = fee_split_bps(has_guild, has_referrer);
            let (guild, referrer, _platform) = split_fee(fee_amount, guild_bps, referrer_bps);
            prop_assert!(guild as u128 + referrer as u128 <= fee_amount as u128);
        }

        // With no guild and no referrer, 100% of the fee must land on the
        // platform — this is the common-case path (every swap before a
        // wallet joins any house or has a referrer) and the one most likely
        // to silently regress if the bps table above is ever edited.
        #[test]
        fn no_guild_no_referrer_is_all_platform(fee_amount: u64) {
            let (guild_bps, referrer_bps) = fee_split_bps(false, false);
            let (guild, referrer, platform) = split_fee(fee_amount, guild_bps, referrer_bps);
            prop_assert_eq!(guild, 0);
            prop_assert_eq!(referrer, 0);
            prop_assert_eq!(platform, fee_amount);
        }
    }
}
