import { PublicKey, type Connection } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'

// Resolves which SPL token program actually owns a mint — classic Token or
// Token-2022. ATA address derivation includes the token program in its own
// seeds, so using the wrong one doesn't error, it just silently computes the
// wrong address entirely. Confirmed live: this was exactly why joining a
// Token-2022 guild token (ANSEM) failed before record_swap.rs/join_guild.rs
// were updated to accept both programs — the program itself now checks the
// real owner, but the client still has to derive the matching ATA.
export async function getTokenProgramId(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint)
  return info?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
}
