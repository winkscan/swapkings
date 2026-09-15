use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;

// One-off recovery instruction: the old commit_swap/reveal_swap pool mechanic
// held real (if small, ~$19 total across ~5 mints) balances in per-mint vault
// token accounts, and reveal_swap — the only withdrawal path — no longer
// exists once that mechanic is retired. Gated to FOUNDER_AUTHORITY (same gate
// sweep_fee already uses for the platform's own treasury) since this moves
// funds with no depositor-specific check at all. Run once per legacy mint
// right after deploying this version, then this can be deleted in a later
// cleanup pass.
#[derive(Accounts)]
pub struct SweepLegacyPool<'info> {
    #[account(mut, address = FOUNDER_AUTHORITY)]
    pub authority: Signer<'info>,

    pub mint: Account<'info, Mint>,

    /// CHECK: legacy PDA authority over the old commit/reveal pool vault.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub pool_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool_vault_authority,
    )]
    pub pool_vault_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_sweep_legacy_pool(ctx: Context<SweepLegacyPool>) -> Result<()> {
    let amount = ctx.accounts.pool_vault_token_account.amount;
    if amount == 0 {
        return Ok(());
    }

    let bump = ctx.bumps.pool_vault_authority;
    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, &[bump]];
    let signer_seeds_arr = [signer_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.pool_vault_token_account.to_account_info(),
        to: ctx.accounts.authority_token_account.to_account_info(),
        authority: ctx.accounts.pool_vault_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, &signer_seeds_arr);
    token::transfer(cpi_ctx, amount)?;

    msg!(
        "Swept legacy pool for mint {}: {} to {}",
        ctx.accounts.mint.key(),
        amount,
        ctx.accounts.authority.key()
    );

    Ok(())
}
