pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("C84oAsWU1whcVLNz2555DP12fBmE116LAiUYsCdkmwaD");

#[program]
pub mod solana_swap_rewards {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        crate::instructions::increment::handle_increment(ctx)
    }

    pub fn record_swap(
        ctx: Context<RecordSwap>,
        usd_cents: u64,
        fee_amount: u64,
        fee_usd_e4: u64,
        referrer_arg: Pubkey,
    ) -> Result<()> {
        crate::instructions::record_swap::handle_record_swap(ctx, usd_cents, fee_amount, fee_usd_e4, referrer_arg)
    }

    pub fn join_guild(ctx: Context<JoinGuild>, token_mint: Pubkey, founder_wallet: Pubkey) -> Result<()> {
        crate::instructions::join_guild::handle_join_guild(ctx, token_mint, founder_wallet)
    }

    pub fn leave_guild(ctx: Context<LeaveGuild>) -> Result<()> {
        crate::instructions::leave_guild::handle_leave_guild(ctx)
    }

    pub fn claim_referral_code(ctx: Context<ClaimReferralCode>, code: [u8; constants::REFERRAL_CODE_LEN]) -> Result<()> {
        crate::instructions::claim_referral_code::handle_claim_referral_code(ctx, code)
    }

    pub fn sweep_fee(ctx: Context<SweepFee>) -> Result<()> {
        crate::instructions::sweep_fee::handle_sweep_fee(ctx)
    }

    pub fn sweep_legacy_pool(ctx: Context<SweepLegacyPool>) -> Result<()> {
        crate::instructions::sweep_legacy_pool::handle_sweep_legacy_pool(ctx)
    }

    pub fn migrate_player_stats(ctx: Context<MigratePlayerStats>) -> Result<()> {
        crate::instructions::migrate_player_stats::handle_migrate_player_stats(ctx)
    }

    pub fn reset_guild_membership(ctx: Context<ResetGuildMembership>) -> Result<()> {
        crate::instructions::reset_guild_membership::handle_reset_guild_membership(ctx)
    }
}
