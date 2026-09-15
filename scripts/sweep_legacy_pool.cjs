#!/usr/bin/env node
// One-off recovery: the old commit_swap/reveal_swap pool mechanic left real
// (if small, ~$19 total) balances sitting in per-mint pool vault token
// accounts, and reveal_swap — the only withdraw path — no longer exists once
// that mechanic is retired. Run this once per legacy mint right after
// deploying the Guilds/LUCK-cashback redesign, then it can be forgotten
// (sweep_legacy_pool is gated to FOUNDER_AUTHORITY, so it's inert otherwise).
//
// Usage:
//   SWEEP_RPC_ENDPOINT=... SWEEP_KEYPAIR_PATH=/path/to/founder-authority.json \
//     node sweep_legacy_pool.cjs <mint1> <mint2> ...
//
// The keypair here MUST be FOUNDER_AUTHORITY itself (constants.rs) — unlike
// sweep_fees.cjs's permissionless sweeper, this instruction checks the caller.
'use strict'

const fs = require('fs')
const path = require('path')
const { Connection, Keypair, PublicKey } = require('@solana/web3.js')
const anchor = require('@coral-xyz/anchor')

const RPC_ENDPOINT = process.env.SWEEP_RPC_ENDPOINT
const KEYPAIR_PATH = process.env.SWEEP_KEYPAIR_PATH
const mints = process.argv.slice(2)

if (!RPC_ENDPOINT) {
  console.error('SWEEP_RPC_ENDPOINT env var is required.')
  process.exit(1)
}
if (!KEYPAIR_PATH) {
  console.error('SWEEP_KEYPAIR_PATH env var is required (path to the FOUNDER_AUTHORITY keypair JSON file).')
  process.exit(1)
}
if (mints.length === 0) {
  console.error('Usage: node sweep_legacy_pool.cjs <mint1> <mint2> ...')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0]
}
const POOL_VAULT_AUTHORITY = pda([Buffer.from('vault_authority')])

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function main() {
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret))

  const connection = new Connection(RPC_ENDPOINT, 'confirmed')
  const wallet = new anchor.Wallet(authority)
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new anchor.Program(idl, provider)

  for (const mintStr of mints) {
    const mint = new PublicKey(mintStr)
    try {
      const sig = await program.methods
        .sweepLegacyPool()
        .accounts({ authority: authority.publicKey, mint, poolVaultAuthority: POOL_VAULT_AUTHORITY })
        .rpc()
      log(`Swept legacy pool for ${mintStr} — tx ${sig}`)
    } catch (err) {
      log(`FAILED to sweep ${mintStr}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
