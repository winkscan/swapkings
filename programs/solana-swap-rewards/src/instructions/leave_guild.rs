use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::{Guild, PlayerStats}};

#[derive(Accounts)]
pub struct LeaveGuild<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAYER_STATS_SEED, depositor.key().as_ref()],
        bump = player_stats.bump,
    )]
    pub player_stats: Account<'info, PlayerStats>,

    #[account(mut, address = player_stats.current_guild)]
    pub guild: Account<'info, Guild>,
}

pub fn handle_leave_guild(ctx: Context<LeaveGuild>) -> Result<()> {
    require!(ctx.accounts.player_stats.current_guild != Pubkey::default(), ErrorCode::NotInGuild);

    ctx.accounts.guild.member_count = ctx.accounts.guild.member_count.saturating_sub(1);
    ctx.accounts.player_stats.current_guild = Pubkey::default();
    ctx.accounts.player_stats.current_guild_founder_wallet = Pubkey::default();

    msg!("{} left guild {}", ctx.accounts.depositor.key(), ctx.accounts.guild.key());

    Ok(())
}
