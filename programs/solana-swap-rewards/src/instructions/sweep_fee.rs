use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
// See record_swap.rs's module comment — token_interface types (and
// transfer_checked) support both the classic SPL Token program and
// Token-2022, since the fee vault can now hold either kind of mint.
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;

#[derive(Accounts)]
pub struct SweepFee<'info> {
    // Permissionless: anyone can trigger a sweep. Safe because funds only ever
    // move to the one fixed destination below (the platform's own treasury),
    // never anywhere the caller chooses.
    #[account(mut)]
    pub caller: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA authority over the fee-collection vault; holds no data of its own.
    #[account(seeds = [FEE_VAULT_AUTHORITY_SEED], bump)]
    pub fee_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = fee_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub fee_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: just a pubkey source for the founder ATA below; pinned to the fixed
    /// FOUNDER_AUTHORITY constant so it can't be swapped for anyone else's.
    #[account(address = FOUNDER_AUTHORITY)]
    pub founder_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = founder_authority,
        associated_token::token_program = token_program,
    )]
    pub founder_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// Sweeps whatever's sitting in fee_token_account to the platform treasury.
// record_swap already routes any guild/referrer share directly at swap time
// (see instructions/record_swap.rs) — everything that lands here by the time
// this runs is already net of that, purely the platform's own cut. Kept as
// its own instruction rather than folded into record_swap so a sweep can also
// be triggered independently/batched.
pub fn handle_sweep_fee(ctx: Context<SweepFee>) -> Result<()> {
    let total = ctx.accounts.fee_token_account.amount;
    if total == 0 {
        return Ok(());
    }

    let bump = ctx.bumps.fee_vault_authority;
    let signer_seeds: &[&[u8]] = &[FEE_VAULT_AUTHORITY_SEED, &[bump]];
    let signer_seeds_arr = [signer_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.fee_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.founder_token_account.to_account_info(),
        authority: ctx.accounts.fee_vault_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        &signer_seeds_arr,
    );
    token_interface::transfer_checked(cpi_ctx, total, ctx.accounts.mint.decimals)?;

    msg!("Swept fee for mint {}: {} to founder", ctx.accounts.mint.key(), total);

    Ok(())
}
