#!/usr/bin/env node
// One-time setup: creates an Address Lookup Table (ALT) holding this
// program's own STATIC accounts — the ones identical on every single swap
// (fee_vault_authority, guild_filler, referrer_filler, both token programs,
// the associated-token program, the system program, and the program's own
// ID). Jupiter's route already compresses its own accounts via its own ALTs
// (see jupiter.ts's resolveLookupTables) — this does the same for OUR
// program's accounts, which were previously sent as raw 32-byte keys every
// time. Needed because record_swap's account list (13+ accounts, several
// required just as constraint-fallback fillers — see that file's own
// comments) pushed a real swap into a guild backed by a Token-2022 mint
// (ANSEM) over Solana's 1232-byte transaction limit — confirmed live
// 2026-08-25 (wallet showed "too large: 1728 bytes" on simulate).
//
// Run once. Prints the resulting ALT address — hardcode that into
// app/src/pdas.ts (SWAP_LOOKUP_TABLE) once it's confirmed. Safe to re-run
// (creates a brand new table each time) but there's no reason to.
'use strict'

const fs = require('fs')
const path = require('path')
const {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableProgram,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js')
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token')

const RPC_ENDPOINT = process.env.LUT_RPC_ENDPOINT
const KEYPAIR_PATH = process.env.LUT_KEYPAIR_PATH

if (!RPC_ENDPOINT) {
  console.error('LUT_RPC_ENDPOINT env var is required.')
  process.exit(1)
}
if (!KEYPAIR_PATH) {
  console.error('LUT_KEYPAIR_PATH env var is required (path to the payer keypair JSON file).')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

function pda(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM_ID)[0]
}

async function main() {
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret))

  const connection = new Connection(RPC_ENDPOINT, 'confirmed')
  const slot = await connection.getSlot('finalized')

  const [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
  })

  const staticAccounts = [
    PROGRAM_ID,
    pda('fee_vault_authority'),
    pda('guild_filler'),
    pda('referrer_filler'),
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
  ]

  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lookupTableAddress,
    addresses: staticAccounts,
  })

  const { blockhash } = await connection.getLatestBlockhash()
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [createIx, extendIx],
  }).compileToV0Message()
  const tx = new VersionedTransaction(message)
  tx.sign([payer])

  const sig = await connection.sendTransaction(tx)
  await connection.confirmTransaction(sig, 'confirmed')

  console.log('Lookup table created:', lookupTableAddress.toBase58())
  console.log('Tx:', `https://solscan.io/tx/${sig}`)
  console.log('\nStatic accounts stored:')
  staticAccounts.forEach((a) => console.log(' -', a.toBase58()))
  console.log(
    '\nNext: set SWAP_LOOKUP_TABLE in app/src/pdas.ts to',
    lookupTableAddress.toBase58(),
    '\n(ALTs need ~1 slot to "warm up" after being extended before they can be referenced by another transaction — already true by the time this script exits.)',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
