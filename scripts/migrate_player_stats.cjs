#!/usr/bin/env node
// One-off migration: grows every existing PlayerStats account to the new,
// larger size (see programs/solana-swap-rewards/src/state.rs's
// earned_for_referrer_cents comment) so the Friends page's memcmp-filtered
// lookup and every normal instruction (record_swap, join_guild, etc.) can
// keep reading them as a typed Account without hitting an out-of-bounds
// Borsh deserialize. Run once, right after deploying the version that adds
// this field — before any of these wallets' next swap/join/leave/claim call,
// since that call would itself hit the exact same deserialize failure this
// script exists to prevent.
//
// Deliberately does NOT use program.account.playerStats.all() to find the
// accounts to migrate — that decodes every result through the CURRENT
// (already-larger) IDL client-side, which throws on precisely the
// still-old-sized accounts this script needs to find. Scans raw via
// getProgramAccounts filtered on the PlayerStats discriminator alone
// (offset 0, works regardless of the account's current byte length) and
// reads `depositor` directly from the first 32 bytes after it — that
// field's offset is identical in the old and new layout either way.
//
// migrate_player_stats itself is idempotent (no-ops if an account's already
// the target size) and permissionless — safe to re-run this script if new
// PlayerStats accounts appear between deploy and running it.
'use strict'

const fs = require('fs')
const path = require('path')
const bs58 = require('bs58')
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js')
const anchor = require('@coral-xyz/anchor')

const RPC_ENDPOINT = process.env.SWEEP_RPC_ENDPOINT
const KEYPAIR_PATH = process.env.SWEEP_KEYPAIR_PATH

if (!RPC_ENDPOINT) {
  console.error('SWEEP_RPC_ENDPOINT env var is required.')
  process.exit(1)
}
if (!KEYPAIR_PATH) {
  console.error('SWEEP_KEYPAIR_PATH env var is required (path to the payer keypair JSON file).')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

const PLAYER_STATS_DISCRIMINATOR = Buffer.from(idl.accounts.find((a) => a.name === 'PlayerStats').discriminator)
const TARGET_SIZE = 8 + idl.types.find((t) => t.name === 'PlayerStats').type.fields.reduce((sum, f) => {
  if (f.type === 'pubkey') return sum + 32
  if (f.type === 'u64') return sum + 8
  if (f.type === 'u8') return sum + 1
  if (f.type && f.type.array) return sum + f.type.array[1]
  throw new Error(`Unhandled field type for ${f.name} while computing TARGET_SIZE`)
}, 0)

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function main() {
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret))

  const connection = new Connection(RPC_ENDPOINT, 'confirmed')
  const wallet = new anchor.Wallet(payer)
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new anchor.Program(idl, provider)

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(PLAYER_STATS_DISCRIMINATOR) } }],
  })

  log(`Found ${accounts.length} PlayerStats account(s), target size ${TARGET_SIZE} bytes.`)

  const needsMigration = accounts.filter(({ account }) => account.data.length < TARGET_SIZE)
  log(`${needsMigration.length} need migrating (${accounts.length - needsMigration.length} already at/above target size).`)

  let migrated = 0
  for (const { pubkey, account } of needsMigration) {
    const depositor = new PublicKey(account.data.subarray(8, 40))
    const [playerStatsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('player_stats'), depositor.toBuffer()],
      PROGRAM_ID,
    )
    if (!playerStatsPda.equals(pubkey)) {
      log(`WARNING: derived PDA for ${depositor.toBase58()} != ${pubkey.toBase58()} — skipping, investigate.`)
      continue
    }
    try {
      const sig = await program.methods
        .migratePlayerStats()
        .accounts({
          payer: payer.publicKey,
          playerStats: pubkey,
          depositor,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
      log(`Migrated ${depositor.toBase58()} (${account.data.length} -> ${TARGET_SIZE} bytes) — tx ${sig}`)
      migrated++
    } catch (err) {
      log(`FAILED to migrate ${depositor.toBase58()}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  log(`Done. ${migrated}/${needsMigration.length} migrated.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
