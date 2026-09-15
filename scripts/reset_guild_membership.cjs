#!/usr/bin/env node
// One-off recovery call for the corrupted-current_guild bug hit live
// 2026-08-22 (see programs/solana-swap-rewards/src/instructions/
// reset_guild_membership.rs for the full root-cause writeup). Resets a
// wallet's PlayerStats.current_guild/current_guild_founder_wallet back to
// "not in a guild" and re-stores the correct bump.
//
// FOUNDER_AUTHORITY-gated as of 2026-08-25 (self-audit finding: unlike
// leave_guild, this never decrements the old guild's member_count, so a
// permissionless version let anyone desync any guild's public member count
// at will) — the keypair here MUST be FOUNDER_AUTHORITY itself
// (constants.rs), same as sweep_legacy_pool.cjs. The target wallet no
// longer signs at all; its address is just passed as an argument.
//
// Usage:
//   SWEEP_RPC_ENDPOINT=... SWEEP_KEYPAIR_PATH=/path/to/founder-authority.json \
//     node reset_guild_membership.cjs <target-wallet-pubkey>
'use strict'

const fs = require('fs')
const path = require('path')
const { Connection, Keypair, PublicKey } = require('@solana/web3.js')
const anchor = require('@coral-xyz/anchor')

const RPC_ENDPOINT = process.env.SWEEP_RPC_ENDPOINT
const KEYPAIR_PATH = process.env.SWEEP_KEYPAIR_PATH
const targetArg = process.argv[2]

if (!RPC_ENDPOINT) {
  console.error('SWEEP_RPC_ENDPOINT env var is required.')
  process.exit(1)
}
if (!KEYPAIR_PATH) {
  console.error('SWEEP_KEYPAIR_PATH env var is required (path to the FOUNDER_AUTHORITY keypair JSON file).')
  process.exit(1)
}
if (!targetArg) {
  console.error('Usage: node reset_guild_membership.cjs <target-wallet-pubkey>')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

async function main() {
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret))
  const depositor = new PublicKey(targetArg)

  const connection = new Connection(RPC_ENDPOINT, 'confirmed')
  const wallet = new anchor.Wallet(authority)
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new anchor.Program(idl, provider)

  const [playerStats] = PublicKey.findProgramAddressSync(
    [Buffer.from('player_stats'), depositor.toBuffer()],
    PROGRAM_ID,
  )

  const before = await program.account.playerStats.fetch(playerStats)
  console.log('Before: currentGuild =', before.currentGuild.toBase58())

  const sig = await program.methods
    .resetGuildMembership()
    .accounts({ authority: authority.publicKey, depositor, playerStats })
    .rpc()

  const after = await program.account.playerStats.fetch(playerStats)
  console.log('After:  currentGuild =', after.currentGuild.toBase58())
  console.log('tx:', sig)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
