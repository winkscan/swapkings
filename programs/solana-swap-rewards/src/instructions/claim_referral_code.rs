use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::{PlayerStats, ReferralCode}};

#[derive(Accounts)]
#[instruction(code: [u8; REFERRAL_CODE_LEN])]
pub struct ClaimReferralCode<'info> {
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

    // `init` (not init_if_needed) is exactly the uniqueness guarantee this
    // needs: this account already existing means the code is taken, and the
    // transaction fails outright — no race, no scan, the client just picks a
    // fresh random code and retries.
    #[account(
        init,
        payer = depositor,
        space = 8 + ReferralCode::INIT_SPACE,
        seeds = [REF_CODE_SEED, &code],
        bump,
    )]
    pub referral_code: Account<'info, ReferralCode>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_referral_code(ctx: Context<ClaimReferralCode>, code: [u8; REFERRAL_CODE_LEN]) -> Result<()> {
    let depositor_key = ctx.accounts.depositor.key();
    let player_stats = &mut ctx.accounts.player_stats;
    require!(
        player_stats.my_referral_code == [0u8; REFERRAL_CODE_LEN],
        ErrorCode::ReferralCodeAlreadyClaimed
    );

    player_stats.depositor = depositor_key;
    player_stats.bump = ctx.bumps.player_stats;
    player_stats.my_referral_code = code;

    ctx.accounts.referral_code.owner = depositor_key;
    ctx.accounts.referral_code.bump = ctx.bumps.referral_code;

    msg!("{} claimed referral code", depositor_key);

    Ok(())
}
