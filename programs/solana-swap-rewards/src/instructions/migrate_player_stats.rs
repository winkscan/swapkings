use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::PlayerStats;

// One-off migration: grows an existing PlayerStats account (created before
// `earned_for_referrer_cents` existed) to the new, larger size and
// zero-fills the added bytes. Every OTHER instruction that touches
// PlayerStats (record_swap, join_guild, leave_guild, claim_referral_code)
// uses a typed `Account<'info, PlayerStats>`, which Borsh-deserializes the
// account's full new layout immediately on entry — an old, smaller account
// would fail that deserialize with an out-of-bounds read before any
// `#[account(realloc = ...)]` constraint even gets a chance to run (realloc
// constraints execute after the typed read, confirmed directly against
// anchor-lang 1.1.2's codegen). So this instruction deliberately takes
// `player_stats` as a raw `UncheckedAccount` instead — no typed deserialize
// at all, just a manual byte-length check and resize — safe to run against
// an account of either the old or the new size.
//
// Permissionless and idempotent by design, same trust model as sweep_fee /
// sweep_legacy_pool: `payer` fronts the small extra rent for the added
// bytes (refundable if this wallet's PlayerStats is ever closed, which
// nothing currently does) but can never redirect or drain anything —
// `player_stats`'s own address is pinned by the `seeds` constraint below, and
// a no-op early return handles an account that's already the new size (or
// somehow already larger), so this is safe to call more than once or against
// an account nothing actually needed to change.
//
// Run once per existing wallet right after deploying the version that adds
// `earned_for_referrer_cents` (see scripts/migrate_player_stats.cjs), before
// any of those wallets' next swap/join/leave/claim — otherwise that next
// call would itself hit the same deserialize failure this instruction exists
// to prevent.
#[derive(Accounts)]
pub struct MigratePlayerStats<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the PlayerStats PDA being grown to the current struct size.
    /// Intentionally not a typed Account — see the module doc comment above.
    #[account(mut, seeds = [PLAYER_STATS_SEED, depositor.key().as_ref()], bump)]
    pub player_stats: UncheckedAccount<'info>,

    /// CHECK: only used to derive player_stats' own seeds — never read or
    /// written directly, doesn't even need to sign.
    pub depositor: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_migrate_player_stats(ctx: Context<MigratePlayerStats>) -> Result<()> {
    let target_size = 8 + PlayerStats::INIT_SPACE;
    let account_info = ctx.accounts.player_stats.to_account_info();
    let current_size = account_info.data_len();

    if current_size >= target_size {
        msg!("PlayerStats for {} already at or above target size — no-op.", ctx.accounts.depositor.key());
        return Ok(());
    }

    let rent = Rent::get()?;
    let target_lamports = rent.minimum_balance(target_size);
    let lamports_needed = target_lamports.saturating_sub(account_info.lamports());

    if lamports_needed > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: account_info.clone(),
                },
            ),
            lamports_needed,
        )?;
    }

    // Grows the account and zero-fills every newly added byte in one call —
    // exactly the semantics `earned_for_referrer_cents: u64` needs to read
    // back as a legitimate starting value of 0, not garbage.
    account_info.resize(target_size)?;

    msg!(
        "Migrated PlayerStats for {}: {} -> {} bytes",
        ctx.accounts.depositor.key(),
        current_size,
        target_size
    );

    Ok(())
}
