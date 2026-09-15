use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::PlayerStats;

// One-off recovery for a real bug hit live, 2026-08-22: migrate_player_stats
// (see that file's own comment) safely grows an account whose existing bytes
// already match the current struct's layout as a PREFIX — true for every
// account created after guilds/referrals existed. It is NOT safe for an
// account old enough to predate an EARLIER schema change that inserted
// current_guild/current_guild_founder_wallet/referrer/my_referral_code
// *before* `bump` rather than appending them at the end. For exactly one
// such fossil account (49 bytes — depositor + cumulative_volume_cents +
// bump only, nothing else), that earlier insertion means its old `bump`
// byte (correctly positioned for the ancient 3-field layout) landed at the
// exact byte offset the current layout uses for `current_guild`'s leading
// byte — so after growing it, `current_guild` decoded as a real-looking but
// entirely bogus Pubkey (the old bump value followed by the zero-fill),
// instead of the Pubkey::default() every other field's zero-fill correctly
// produced. Confirmed live via direct simulation: any join_guild call for
// this wallet permanently demands a `previous_guild` matching that bogus
// address, and leave_guild can't even load a `guild` account at an address
// nothing ever initialized — both fail unconditionally until this runs.
//
// Originally depositor-gated (any wallet could reset its own membership,
// reasoned to be harmless since it can't touch anyone else's funds/state) —
// changed to FOUNDER_AUTHORITY-gated, same pattern as sweep_fee/
// sweep_legacy_pool, after a free self-audit pass, 2026-08-25: unlike
// leave_guild, this never decrements the old guild's member_count, so a
// permissionless version let anyone silently desync any guild's public
// member count at will (no fund impact, but a real, repeatable integrity
// bug on the Houses leaderboard). This instruction was only ever meant as a
// one-off recovery tool for the specific fossil-account bug described above,
// not a general self-service action — gating it closes that off while still
// leaving it callable for the next time a similarly-corrupted account turns
// up. `depositor` is deliberately still just the target account reference
// (not a signer) so the authority can run this against any wallet's
// PlayerStats, not only its own. Also re-derives and re-stores the correct
// `bump` while here — the old account's real bump ended up similarly
// misplaced, and leave_guild's own `bump = player_stats.bump` constraint
// depends on it being right.
#[derive(Accounts)]
pub struct ResetGuildMembership<'info> {
    #[account(address = FOUNDER_AUTHORITY)]
    pub authority: Signer<'info>,

    /// CHECK: only used to derive player_stats' own seeds — never read or
    /// written directly, doesn't need to sign (the gate is on `authority`).
    pub depositor: UncheckedAccount<'info>,

    #[account(mut, seeds = [PLAYER_STATS_SEED, depositor.key().as_ref()], bump)]
    pub player_stats: Account<'info, PlayerStats>,
}

pub fn handle_reset_guild_membership(ctx: Context<ResetGuildMembership>) -> Result<()> {
    ctx.accounts.player_stats.current_guild = Pubkey::default();
    ctx.accounts.player_stats.current_guild_founder_wallet = Pubkey::default();
    ctx.accounts.player_stats.bump = ctx.bumps.player_stats;

    msg!("Reset guild membership for {}", ctx.accounts.depositor.key());

    Ok(())
}
