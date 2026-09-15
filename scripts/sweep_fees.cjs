#!/usr/bin/env node
// Cron-friendly sweep: finds every mint currently sitting in the fee vault
// (fee_vault_authority PDA) and calls sweep_fee for each one, forwarding the
// full balance to the founder/treasury wallet on-chain. Any guild/referrer
// share has already been routed directly at swap time by record_swap — this
// only ever sees the platform's own remaining cut.
//
// sweep_fee is permissionless — the caller only pays gas + any account-init
// rent, it can never redirect funds (the founder destination is pinned in the
// program itself) — so this intentionally runs as a separate, low-value
// "sweeper" keypair rather than the founder's own key.
//
// Scans BOTH the classic SPL Token program and Token-2022 — sweep_fee.rs's
// accounts now accept either (see that file's own comment: a real pump.fun
// token, ANSEM, turned out to be Token-2022, and the fee vault can hold fees
// from any mint a swap ever used) — scanning only the classic program would
// silently leave real Token-2022 fees unswept forever. `token_program` is no
// longer a fixed address Anchor's client can auto-resolve either, so it's
// passed explicitly per mint below.
'use strict'

const fs = require('fs')
const path = require('path')
const { Connection, Keypair, PublicKey } = require('@solana/web3.js')
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token')
const anchor = require('@coral-xyz/anchor')

const RPC_ENDPOINT = process.env.SWEEP_RPC_ENDPOINT
const KEYPAIR_PATH = process.env.SWEEP_KEYPAIR_PATH

if (!RPC_ENDPOINT) {
  console.error('SWEEP_RPC_ENDPOINT env var is required.')
  process.exit(1)
}
if (!KEYPAIR_PATH) {
  console.error('SWEEP_KEYPAIR_PATH env var is required (path to the sweeper keypair JSON file).')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0]
}
const FEE_VAULT_AUTHORITY = pda([Buffer.from('fee_vault_authority')])

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

  const solBalance = await connection.getBalance(payer.publicKey)
  if (solBalance < 0.01 * 1e9) {
    log(`WARNING: sweeper wallet ${payer.publicKey.toBase58()} is low on SOL (${solBalance / 1e9} SOL) — top it up soon.`)
  }

  const withBalance = []
  for (const tokenProgramId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const { value } = await connection.getParsedTokenAccountsByOwner(FEE_VAULT_AUTHORITY, {
      programId: tokenProgramId,
    })
    for (const v of value) {
      const info = v.account.data.parsed.info
      if (Number(info.tokenAmount.amount) > 0) {
        withBalance.push({ ...info, tokenProgramId })
      }
    }
  }

  if (withBalance.length === 0) {
    log('No fees to sweep.')
    return
  }

  log(`Found ${withBalance.length} mint(s) with unswept fees.`)

  for (const info of withBalance) {
    const mint = new PublicKey(info.mint)
    try {
      const sig = await program.methods
        .sweepFee()
        .accounts({ caller: payer.publicKey, mint, tokenProgram: info.tokenProgramId })
        .rpc()
      log(`Swept ${info.tokenAmount.uiAmountString} of ${info.mint} — tx ${sig}`)
    } catch (err) {
      log(`FAILED to sweep ${info.mint}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
