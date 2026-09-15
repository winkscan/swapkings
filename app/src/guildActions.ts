import {
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import type { AnchorWallet, WalletContextState } from '@solana/wallet-adapter-react'
import { getProgram } from './anchorClient'
import { guildPda, playerStatsPda } from './pdas'
import { getFounderAttestation } from './cacheWorker'
import { confirmSignature } from './confirmTx'
import { normalizeSignature } from './signature'

async function sendAndConfirm(
  connection: Connection,
  wallet: AnchorWallet,
  sendTransaction: WalletContextState['sendTransaction'],
  ixs: TransactionInstruction | TransactionInstruction[],
) {
  const tx = new Transaction().add(...(Array.isArray(ixs) ? ixs : [ixs]))
  tx.feePayer = wallet.publicKey

  // Simulate first so a real on-chain failure surfaces its actual reason
  // (program error + logs) instead of just the wallet adapter's generic
  // "Internal error" — same pre-flight pattern swapExecutor.ts already uses
  // for swaps. Confirmed missing live, 2026-08-22: a real join_guild
  // failure showed nothing but "Internal error" in this app's own error
  // modal, forcing a slower, separate manual on-chain simulation just to
  // find the real cause. No second argument to simulateTransaction here —
  // this is a legacy (non-versioned) Transaction, and this web3.js version
  // throws "Invalid arguments" if the second arg isn't a signers array
  // (confirmed directly against its source); omitting it entirely leaves
  // sigVerify off by default, which is exactly what's wanted for an
  // unsigned pre-flight check.
  const sim = await connection.simulateTransaction(tx)
  if (sim.value.err) {
    console.error('Guild action simulation failed:', sim.value.err, '\nlogs:', sim.value.logs)
    throw new Error(
      `Simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).slice(-8).join('\n')}`,
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  // normalizeSignature: see that function's own comment — some wallets
  // return this as base64 instead of the base58 confirmSignature's RPC
  // polling actually expects.
  const sig = normalizeSignature(await sendTransaction(tx, connection))
  // Manual polling, not connection.confirmTransaction() — see confirmTx.ts's
  // own comment for why that method can hang indefinitely against an
  // HTTP-only RPC endpoint like ours.
  await confirmSignature(connection, sig, lastValidBlockHeight)
  return sig
}

// Joining is free (beyond the one-time rent if this is the very first wallet
// to join this particular token's guild) and instant — no invite, no cost.
// `previousGuild` must be the depositor's current guild's own PDA when
// they're switching from one guild to another (the program needs it to
// decrement that guild's member_count); omit it when joining fresh.
export async function joinGuild({
  connection,
  wallet,
  sendTransaction,
  tokenMint,
  founderWallet,
  previousGuild,
  isNewGuild,
}: {
  connection: Connection
  wallet: AnchorWallet
  sendTransaction: WalletContextState['sendTransaction']
  tokenMint: PublicKey
  founderWallet: PublicKey
  previousGuild: PublicKey | null
  // True only when this token's Guild PDA doesn't exist on-chain yet (the
  // caller already knows this — see GuildsPage's own `guildPda === ''` for
  // rows that came from off-chain discovery, never yet joined by anyone).
  // join_guild.rs only reads/needs the attestation on that exact creation
  // path — passing it on every re-join of an already-real guild would just
  // be an extra Worker round-trip for nothing, since founder_wallet is
  // ignored there anyway once the guild is real.
  isNewGuild: boolean
}) {
  const program = getProgram(connection, wallet)
  const guild = guildPda(tokenMint)

  // See constants.rs's ATTESTATION_SIGNER / join_guild.rs's own comments for
  // the full story: this is the real fix for a real vulnerability (anyone
  // could otherwise call join_guild directly, bypassing this file entirely,
  // and permanently hijack a token's House fee routing). The Worker
  // resolves the mint's real founder itself and refuses to sign anything
  // that doesn't match `founderWallet` — if this throws, house creation
  // genuinely can't proceed safely right now, so the error is allowed to
  // propagate rather than silently falling back to an unattested join.
  const extraInstructions: TransactionInstruction[] = []
  if (isNewGuild) {
    const attestation = await getFounderAttestation(tokenMint.toBase58(), founderWallet.toBase58())
    extraInstructions.push(
      Ed25519Program.createInstructionWithPublicKey({
        publicKey: new PublicKey(attestation.publicKey).toBytes(),
        message: Buffer.concat([tokenMint.toBuffer(), founderWallet.toBuffer()]),
        signature: Buffer.from(attestation.signature, 'base64'),
      }),
    )
  }
  // `previousGuild` must be explicitly set to `null` (not omitted) when
  // there's no guild being left — verified against a real mainnet call:
  // omitting the key entirely throws "Account `previousGuild` not provided"
  // from Anchor's TS client, even though it's Option<Account> on the Rust
  // side. Anchor's resolver apparently still wants the key present, just
  // nullable, for Option accounts on this SDK version.
  // The `as any` here (and on every other .accounts() call in this file) is
  // a workaround for an Anchor TS SDK typing limitation: ResolvedAccounts
  // stops resolving to a real merged object type once a program has enough
  // instructions/accounts, and instead reports every valid field name as
  // "does not exist" — a known upstream friction point, not a runtime issue.
  // Field names below are verified directly against the Rust #[derive(Accounts)]
  // structs (record_swap.rs / join_guild.rs / leave_guild.rs).
  const ix = await program.methods
    .joinGuild(tokenMint, founderWallet)
    .accounts({
      depositor: wallet.publicKey,
      playerStats: playerStatsPda(wallet.publicKey),
      tokenMint,
      guild,
      previousGuild: previousGuild ?? null,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      // Explicit rather than relying on Anchor's TS client to auto-resolve
      // this well-known program — confirmed live 2026-08-25 that stopped
      // working once instructions_sysvar was added to the account list
      // (real join failure: "AccountNotEnoughKeys... caused by account:
      // system_program" — the client silently built an instruction one
      // account short instead of erroring at build time).
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction()
  // The ed25519 attestation instruction (if any) MUST come immediately
  // before join_guild — that's the exact relative index join_guild.rs's own
  // introspection check reads (see verify_founder_attestation's
  // `current_index - 1`).
  return sendAndConfirm(connection, wallet, sendTransaction, [...extraInstructions, ix])
}

export async function leaveGuild({
  connection,
  wallet,
  sendTransaction,
  guild,
}: {
  connection: Connection
  wallet: AnchorWallet
  sendTransaction: WalletContextState['sendTransaction']
  guild: PublicKey
}) {
  const program = getProgram(connection, wallet)
  const ix = await program.methods
    .leaveGuild()
    .accounts({
      depositor: wallet.publicKey,
      playerStats: playerStatsPda(wallet.publicKey),
      guild,
    } as any)
    .instruction()
  return sendAndConfirm(connection, wallet, sendTransaction, ix)
}
