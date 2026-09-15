import {
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import { getProgram } from './anchorClient'
import { guildPda, playerStatsPda } from './pdas'
import { getFounderAttestation } from './cacheWorker'

// Mobile split of guildActions.ts: these build the instructions only; the
// screen runs them through useTxRunner (MWA session + simulate + confirm).
// Every `as any` and account-name choice is carried over verbatim from the
// web version — field names are verified against join_guild.rs /
// leave_guild.rs's #[derive(Accounts)].

// Joining is free and instant. `previousGuild` must be the depositor's
// current guild PDA when switching guilds (so the program can decrement that
// guild's member_count), null when joining fresh. `isNewGuild` is true only
// when this token's Guild PDA doesn't exist on-chain yet — that's the one
// path join_guild.rs reads the founder attestation on.
export async function buildJoinGuildIxs(params: {
  connection: Connection
  walletPublicKey: PublicKey
  tokenMint: PublicKey
  founderWallet: PublicKey
  previousGuild: PublicKey | null
  isNewGuild: boolean
}): Promise<TransactionInstruction[]> {
  const { connection, walletPublicKey, tokenMint, founderWallet, previousGuild, isNewGuild } = params
  const program = getProgram(connection, walletPublicKey)
  const guild = guildPda(tokenMint)

  const extraInstructions: TransactionInstruction[] = []
  if (isNewGuild) {
    // See constants.rs's ATTESTATION_SIGNER / join_guild.rs: the Worker
    // resolves the mint's real founder and refuses to sign anything that
    // doesn't match. If this throws, house creation genuinely can't proceed
    // safely — let it propagate rather than falling back to an unattested join.
    const attestation = await getFounderAttestation(tokenMint.toBase58(), founderWallet.toBase58())
    extraInstructions.push(
      Ed25519Program.createInstructionWithPublicKey({
        publicKey: new PublicKey(attestation.publicKey).toBytes(),
        message: Buffer.concat([tokenMint.toBuffer(), founderWallet.toBuffer()]),
        signature: Buffer.from(attestation.signature, 'base64'),
      }),
    )
  }

  const ix = await program.methods
    .joinGuild(tokenMint, founderWallet)
    .accounts({
      depositor: walletPublicKey,
      playerStats: playerStatsPda(walletPublicKey),
      tokenMint,
      guild,
      previousGuild: previousGuild ?? null,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction()

  // The ed25519 attestation instruction (if any) MUST come immediately before
  // join_guild — that's the exact relative index join_guild.rs's introspection
  // check reads (`current_index - 1`).
  return [...extraInstructions, ix]
}

export async function buildLeaveGuildIx(params: {
  connection: Connection
  walletPublicKey: PublicKey
  guild: PublicKey
}): Promise<TransactionInstruction> {
  const { connection, walletPublicKey, guild } = params
  const program = getProgram(connection, walletPublicKey)
  return program.methods
    .leaveGuild()
    .accounts({
      depositor: walletPublicKey,
      playerStats: playerStatsPda(walletPublicKey),
      guild,
    } as any)
    .instruction()
}
