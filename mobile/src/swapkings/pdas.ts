import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import idl from './idl/solana_swap_rewards.json'

export const PROGRAM_ID = new PublicKey(idl.address)

// Address Lookup Table holding this program's own STATIC accounts (same on
// every swap: fee_vault_authority, guild_filler, referrer_filler, both token
// programs, the associated-token program, the system program, and the
// program's own ID) — compresses each from a raw 32-byte key down to a
// 1-byte index in the transaction message. Created once via
// scripts/create_lookup_table.cjs (2026-08-25, tx
// 2ySnYQAmypmyoK6PAcRbpAUp5AGej3HffRu252kjrdKUQQ7S4dn176AidesBGstMLvHG2Wh15mbw6W6iZpMA3MAH)
// after a real swap into a Token-2022 guild (ANSEM) pushed record_swap's
// account list over Solana's 1232-byte transaction limit — Jupiter's route
// already compresses its own accounts the same way (see jupiter.ts's
// resolveLookupTables), this does the same for ours.
export const SWAP_LOOKUP_TABLE = new PublicKey('3Z6pahzAiRHJQAAxAoxaBWnCtPiqcYBSt7XUgTFu58Sk')

// Matches Rust's Pubkey::default() (all-zero bytes) — the on-chain sentinel
// for "not set" (no guild, no referrer, etc). Same bytes as the System
// Program's own address, just constructed explicitly so the intent reads
// clearly at every call site.
export const ZERO_PUBKEY = new PublicKey(new Uint8Array(32))

export function feeVaultAuthorityPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('fee_vault_authority')], PROGRAM_ID)[0]
}

// ATA owned by feeVaultAuthorityPda() for a given mint — where record_swap's
// platform-share transfer (and later sweep_fee's forwarding of it) lands.
// `tokenProgramId` must match whichever program actually owns `mint`
// (classic Token vs Token-2022 — see tokenProgram.ts) since it's baked into
// the ATA's own derivation seeds; defaults to classic Token for callers that
// already know that's all they'll ever pass.
export function feeVaultTokenAccount(mint: PublicKey, tokenProgramId: PublicKey = TOKEN_PROGRAM_ID) {
  return getAssociatedTokenAddressSync(mint, feeVaultAuthorityPda(), true /* allowOwnerOffCurve: PDA */, tokenProgramId)
}

export function playerStatsPda(depositor: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('player_stats'), depositor.toBuffer()], PROGRAM_ID)[0]
}

// Byte offset of PlayerStats::referrer within the account's raw data,
// counting the 8-byte Anchor discriminator: depositor(32) +
// cumulative_volume_cents(8) + current_guild(32) +
// current_guild_founder_wallet(32) = 104, + 8 discriminator = 112. Lets
// useFriends.ts ask the RPC to filter for "every PlayerStats whose referrer
// is me" server-side (getProgramAccounts memcmp) instead of fetching every
// PlayerStats account that has ever existed and filtering client-side —
// confirmed against the actual built IDL's field order, not just hand-
// counted from state.rs. Re-verify this if PlayerStats' field order (not
// just which fields exist) ever changes — a field REMOVED or reordered
// before `referrer` would shift this; earned_for_referrer_cents was
// deliberately appended at the very end specifically so it never could.
export const PLAYER_STATS_REFERRER_OFFSET = 112

export function guildPda(tokenMint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('guild'), tokenMint.toBuffer()], PROGRAM_ID)[0]
}

// Inert filler authorities for record_swap's guild_founder_wallet/
// referrer_wallet when a depositor has no guild/no referrer — see
// constants.rs's GUILD_FILLER_SEED comment for the real bug this fixes
// (both used to share fee_vault_authority, collapsing 3 separate token
// accounts into 1 and crashing every swap with neither a guild nor a
// referrer — confirmed live 2026-08-22).
export function guildFillerPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('guild_filler')], PROGRAM_ID)[0]
}
export function referrerFillerPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('referrer_filler')], PROGRAM_ID)[0]
}

export function referralCodePda(code: Uint8Array) {
  return PublicKey.findProgramAddressSync([Buffer.from('ref_code'), Buffer.from(code)], PROGRAM_ID)[0]
}

// Mirrors constants::REFERRAL_CODE_LEN in the Rust program.
export const REFERRAL_CODE_LEN = 7

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// Fully random — carries no information about the claiming wallet, so a
// referral link never exposes the referrer's address. Uniqueness is enforced
// on-chain by claim_referral_code's `init` constraint, not here; a collision
// just means the transaction fails and the caller tries a fresh code.
export function randomReferralCode(): Uint8Array {
  const random = new Uint8Array(REFERRAL_CODE_LEN)
  crypto.getRandomValues(random)
  const bytes = new Uint8Array(REFERRAL_CODE_LEN)
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
    bytes[i] = REFERRAL_CODE_ALPHABET.charCodeAt(random[i] % REFERRAL_CODE_ALPHABET.length)
  }
  return bytes
}

export function referralCodeToString(code: number[] | Uint8Array): string {
  return String.fromCharCode(...Array.from(code).filter((b) => b !== 0))
}

export function referralCodeFromString(code: string): Uint8Array {
  const bytes = new Uint8Array(REFERRAL_CODE_LEN)
  for (let i = 0; i < REFERRAL_CODE_LEN && i < code.length; i++) bytes[i] = code.charCodeAt(i)
  return bytes
}
