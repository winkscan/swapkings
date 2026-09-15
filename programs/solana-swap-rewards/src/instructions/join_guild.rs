use anchor_lang::prelude::*;
// anchor-lang 1.1.2 doesn't re-export either of these itself (confirmed
// directly against its own source — its `solana_program::sysvar::instructions`
// only re-exports BorrowedInstruction/construct_instructions_data, no
// loader functions, and it has no ed25519_program module at all), so both
// come straight from the underlying Solana SDK crates instead (added as
// direct dependencies in Cargo.toml, pinned to the exact versions Cargo
// already resolved for them transitively).
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};
use solana_sdk_ids::ed25519_program;
// token_interface's Mint accepts a mint owned by either the classic SPL
// Token program or Token-2022 — plain token::Mint would reject any
// Token-2022 mint outright (AccountOwnedByWrongProgram), which a real
// pump.fun/letsbonk token can be (confirmed live: ANSEM is Token-2022).
use anchor_spl::token_interface::Mint;

use crate::{constants::*, error::ErrorCode, state::{Guild, PlayerStats}};

// Layout of a native Ed25519Program instruction built with exactly one
// signature (both @solana/web3.js's Ed25519Program.createInstructionWithPublicKey
// and Solana's own Rust-side helper use this same byte order: a fixed
// 16-byte offsets header, then pubkey, then signature, then message) —
// see Solana's ed25519_program source for the canonical layout this mirrors.
const ED25519_HEADER_LEN: usize = 16;
const ED25519_PUBKEY_OFFSET: usize = ED25519_HEADER_LEN;
const ED25519_PUBKEY_LEN: usize = 32;
const ED25519_SIGNATURE_OFFSET: usize = ED25519_PUBKEY_OFFSET + ED25519_PUBKEY_LEN;
const ED25519_SIGNATURE_LEN: usize = 64;
const ED25519_MESSAGE_OFFSET: usize = ED25519_SIGNATURE_OFFSET + ED25519_SIGNATURE_LEN;

// Confirms a native ed25519_program instruction attesting EXACTLY
// `ATTESTATION_SIGNER` signed `token_mint || founder_wallet` sits
// immediately before this instruction in the same transaction. Doesn't
// re-verify the signature itself — the Solana runtime already rejects the
// whole transaction before this handler ever runs if that native
// instruction's signature doesn't actually check out; this only confirms
// the RIGHT instruction (right signer, right message) was actually there,
// so a caller can't just omit it or swap in an attestation for a different
// mint/founder pair.
fn verify_founder_attestation(
    instructions_sysvar: &AccountInfo,
    token_mint: &Pubkey,
    founder_wallet: &Pubkey,
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(ErrorCode::MissingFounderAttestation))?;
    require!(current_index > 0, ErrorCode::MissingFounderAttestation);

    let ix = load_instruction_at_checked((current_index - 1) as usize, instructions_sysvar)
        .map_err(|_| error!(ErrorCode::MissingFounderAttestation))?;
    require_keys_eq!(ix.program_id, ed25519_program::ID, ErrorCode::MissingFounderAttestation);

    let data = &ix.data;
    require!(
        data.len() == ED25519_MESSAGE_OFFSET + 64,
        ErrorCode::MissingFounderAttestation
    );
    require!(
        &data[ED25519_PUBKEY_OFFSET..ED25519_PUBKEY_OFFSET + ED25519_PUBKEY_LEN] == ATTESTATION_SIGNER.as_ref(),
        ErrorCode::MissingFounderAttestation
    );
    let message = &data[ED25519_MESSAGE_OFFSET..];
    require!(
        &message[0..32] == token_mint.as_ref() && &message[32..64] == founder_wallet.as_ref(),
        ErrorCode::MissingFounderAttestation
    );
    Ok(())
}

#[derive(Accounts)]
pub struct JoinGuild<'info> {
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

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + Guild::INIT_SPACE,
        seeds = [GUILD_SEED, token_mint.key().as_ref()],
        bump,
    )]
    pub guild: Account<'info, Guild>,

    // The guild being left, if the depositor is currently in a different one —
    // omit entirely when joining fresh (no prior guild) or re-joining the same
    // guild. The handler enforces this is actually required/consistent, so a
    // caller can't decrement the wrong guild or skip the decrement.
    #[account(mut)]
    pub previous_guild: Option<Account<'info, Guild>>,

    /// CHECK: the sysvar this program reads to introspect the ed25519_program
    /// attestation instruction — pinned to the real Instructions sysvar
    /// address, never any other account.
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// Guilds are freely joinable and leaveable — no invite, no cost beyond rent
// the first time a given token's Guild PDA is created. `founder_wallet` is
// only ever taken from whoever creates the Guild PDA (the first joiner), and
// ONLY once a real Ed25519 attestation from ATTESTATION_SIGNER (see that
// constant's own comment) confirms it's really this mint's founder — a
// later joiner's own founder_wallet argument is ignored once the guild
// already exists, so nobody can quietly redirect an established guild's
// payouts by joining with a different value either.
pub fn handle_join_guild(ctx: Context<JoinGuild>, token_mint: Pubkey, founder_wallet: Pubkey) -> Result<()> {
    require!(ctx.accounts.token_mint.key() == token_mint, ErrorCode::GuildMismatch);

    let guild = &mut ctx.accounts.guild;
    if guild.token_mint == Pubkey::default() {
        verify_founder_attestation(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &token_mint,
            &founder_wallet,
        )?;
        guild.token_mint = token_mint;
        guild.founder_wallet = founder_wallet;
        guild.bump = ctx.bumps.guild;
    }

    let depositor_key = ctx.accounts.depositor.key();
    let player_stats = &mut ctx.accounts.player_stats;
    player_stats.depositor = depositor_key;
    player_stats.bump = ctx.bumps.player_stats;

    let previous = player_stats.current_guild;
    let guild_key = guild.key();

    if previous != guild_key {
        if previous != Pubkey::default() {
            let prev_guild = ctx.accounts.previous_guild.as_mut().ok_or(ErrorCode::MissingPreviousGuild)?;
            require_keys_eq!(prev_guild.key(), previous, ErrorCode::GuildMismatch);
            prev_guild.member_count = prev_guild.member_count.saturating_sub(1);
        }
        guild.member_count = guild.member_count.checked_add(1).ok_or(ErrorCode::FeeOverflow)?;
        player_stats.current_guild = guild_key;
        player_stats.current_guild_founder_wallet = guild.founder_wallet;
    }

    msg!("{} joined guild {} ({})", depositor_key, guild_key, token_mint);

    Ok(())
}
