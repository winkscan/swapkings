#!/usr/bin/env node
// Real-fund audit tool, 2026-08-25 — see constants.rs's own comment on
// MAX_USD_CENTS_PER_SWAP for the full context. usd_cents (what drives a
// wallet's displayed LUCK/RANK tier) is pure client-reported input to
// record_swap, with no on-chain link to fee_amount (the REAL token transfer
// the same call makes). The fee itself can never be faked or redirected —
// this only checks whether a wallet's CLAIMED cumulative_volume_cents is
// actually plausible given the REAL fees it has ever paid.
//
// Methodology: scans every record_swap transaction a wallet has ever sent,
// reads the REAL fee_amount straight from record_swap.rs's own on-chain log
// line (not reconstructed from token-transfer heuristics), converts it to
// USD at TODAY's price for whatever mint was involved (an approximation —
// this is a diagnostic tool, not a precise historical accounting system),
// and divides by the LOWEST possible effective fee rate the wallet could
// have paid (PLATFORM_FEE_BPS at maximum LUCK-tier discount) to get the
// MOST GENEROUS possible real volume that fee could represent. Summed
// across every swap, compared against the wallet's own claimed
// cumulative_volume_cents. If even this most-generous-possible reading
// still falls far short of what's claimed, that's real evidence of
// inflation — not a guess.
//
// Usage: node scripts/audit_wallet_volume.cjs <WALLET_ADDRESS>
'use strict'

const fs = require('fs')
const path = require('path')
const { Connection, PublicKey } = require('@solana/web3.js')
const anchor = require('@coral-xyz/anchor')

const RPC_ENDPOINT = process.env.AUDIT_RPC_ENDPOINT
const HELIUS_API_KEY = process.env.AUDIT_HELIUS_API_KEY

if (!RPC_ENDPOINT || !HELIUS_API_KEY) {
  console.error('AUDIT_RPC_ENDPOINT and AUDIT_HELIUS_API_KEY env vars are required.')
  process.exit(1)
}

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/audit_wallet_volume.cjs <WALLET_ADDRESS>')
  process.exit(1)
}

const idlPath = path.join(__dirname, '../app/src/idl/solana_swap_rewards.json')
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)

// Mirrors app/src/jupiter.ts's PLATFORM_FEE_BPS and constants.rs's
// TIER_KRAKEN_DISCOUNT_BPS — the most generous (lowest) real fee rate any
// wallet could ever legitimately pay.
const PLATFORM_FEE_BPS = 20 // 0.2%
const MAX_DISCOUNT_BPS = 5000 // King tier, 50% off
const MIN_EFFECTIVE_FEE_BPS = (PLATFORM_FEE_BPS * (10000 - MAX_DISCOUNT_BPS)) / 10000 // 0.1%

const RECORD_SWAP_LOG_RE = /Recorded swap for (\w+): fee (\d+) \(guild \d+, referrer \d+, platform \d+\), lucky score now \d+/

const priceCache = new Map()
async function getUsdPrice(mint) {
  if (priceCache.has(mint)) return priceCache.get(mint)
  const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`)
  const data = res.ok ? await res.json() : {}
  const price = data[mint]?.usdPrice ?? 0
  priceCache.set(mint, price)
  return price
}

const decimalsCache = new Map()
async function getMintDecimals(mint) {
  if (decimalsCache.has(mint)) return decimalsCache.get(mint)
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`)
  const data = res.ok ? await res.json() : []
  const token = data.find((t) => (t.id ?? t.address) === mint)
  const decimals = token?.decimals ?? null
  decimalsCache.set(mint, decimals)
  return decimals
}

async function main() {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed')
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(anchor.web3.Keypair.generate()), {})
  const program = new anchor.Program(idl, provider)

  const walletPk = new PublicKey(wallet)
  const [playerStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('player_stats'), walletPk.toBuffer()],
    PROGRAM_ID,
  )
  const playerStats = await program.account.playerStats.fetchNullable(playerStatsPda)
  if (!playerStats) {
    console.log(`No PlayerStats found for ${wallet} — this wallet has never recorded a swap.`)
    return
  }
  const claimedVolumeUsd = Number(playerStats.cumulativeVolumeCents.toString()) / 100

  console.log(`Auditing ${wallet}`)
  console.log(`Claimed cumulative volume: $${claimedVolumeUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
  console.log('Scanning real transaction history...\n')

  // Capped at 5 pages (≤500 signatures, ≤500 Helius credits for the
  // getTransaction pass below) by default — a cost-conscious bound for a
  // manually-run diagnostic tool, not a full lifetime archive. Override with
  // AUDIT_MAX_PAGES if a wallet genuinely needs a deeper look.
  const maxPages = Number(process.env.AUDIT_MAX_PAGES || 5)
  let allSignatures = []
  let before
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`)
    url.searchParams.set('api-key', HELIUS_API_KEY)
    url.searchParams.set('limit', '100')
    if (before) url.searchParams.set('before', before)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Helius history request failed: ${res.status}`)
    const txs = await res.json()
    if (txs.length === 0) break
    allSignatures.push(...txs.map((t) => t.signature))
    before = txs[txs.length - 1].signature
    if (txs.length < 100) break
  }
  console.log(`Found ${allSignatures.length} total transactions to check.`)

  // Phase 1: raw getTransaction per signature, just to read record_swap.rs's
  // own "Recorded swap for X: fee Y (...)" log line — the authoritative
  // source for the REAL fee_amount (no heuristics needed for this part).
  let fetchFailures = 0
  const matches = [] // { signature, feeAmountRaw }
  for (const sig of allSignatures) {
    // Paced deliberately — firing getTransaction back-to-back with no delay
    // reliably 429s Helius partway through a wallet with any real history
    // (confirmed live 2026-08-25), and web3.js's own retry wasn't always
    // enough to save every call under that load.
    await new Promise((r) => setTimeout(r, 150))
    let tx
    try {
      tx = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    } catch (err) {
      fetchFailures++
      console.warn(`  ${sig.slice(0, 20)}...: getTransaction failed (${err.message}) — NOT counted, results may undercount`)
      continue
    }
    if (!tx || !tx.meta || !tx.meta.logMessages) continue
    const logLine = tx.meta.logMessages.find((l) => l.includes('Recorded swap for'))
    if (!logLine) continue
    const match = RECORD_SWAP_LOG_RE.exec(logLine)
    if (!match || match[1] !== wallet) continue
    const feeAmountRaw = BigInt(match[2])
    if (feeAmountRaw === 0n) continue
    matches.push({ signature: sig, feeAmountRaw })
  }
  console.log(`Found ${matches.length} real record_swap transactions for this wallet.\n`)

  // Phase 2: identify each match's fee mint via Helius's ENHANCED
  // transactions API (batched, ≤100 signatures/call) instead of raw
  // pre/postTokenBalances — confirmed live 2026-08-25 that a SOL-output
  // swap's fee comes out of a temporary wrapped-SOL ATA swapExecutor.ts
  // creates and closes within the SAME transaction (see that file's own
  // "re-wrap just enough for the fee" comment): its pre AND post balance are
  // both 0 (created empty, drained, closed), so raw balance-diffing can
  // NEVER see the real flow through it — Solana's tx metadata only exposes
  // net start/end state, not intermediate movement. The enhanced API parses
  // actual instruction-level transfers instead, which is the only way to
  // recover this. Summed by mint (not matched per-account) because the real
  // fee is split across up to 3 separate legs (guild/referrer/platform) that
  // only add up to feeAmountRaw together, never individually.
  let totalRealFeeUsd = 0
  let swapCount = 0
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100)
    const res = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: batch.map((m) => m.signature) }),
    })
    if (!res.ok) {
      console.warn(`  Enhanced API batch failed (${res.status}) — ${batch.length} swaps not counted`)
      continue
    }
    const enhancedTxs = await res.json()
    const enhancedBySig = new Map(enhancedTxs.map((t) => [t.signature, t]))

    for (const { signature, feeAmountRaw } of batch) {
      const enhanced = enhancedBySig.get(signature)
      const outgoing = (enhanced?.tokenTransfers || []).filter((t) => t.fromUserAccount === wallet)
      const byMint = new Map() // mint -> summed UI amount across every outgoing leg for that mint
      for (const t of outgoing) {
        byMint.set(t.mint, (byMint.get(t.mint) || 0) + t.tokenAmount)
      }
      // tokenAmount is already the UI (human) amount — reconstruct raw units
      // per candidate mint using enough decimal precision to compare exactly
      // against feeAmountRaw (an integer). Try the decimals Jupiter reports
      // for that mint; skip mints we can't resolve rather than guess.
      let bestMint = null
      for (const [mint, uiSum] of byMint) {
        const decimals = await getMintDecimals(mint)
        if (decimals === null) continue
        const rawSum = BigInt(Math.round(uiSum * 10 ** decimals))
        if (rawSum === feeAmountRaw) {
          bestMint = { mint, decimals }
          break
        }
      }
      if (!bestMint) {
        console.log(`  ${signature.slice(0, 20)}...: fee=${feeAmountRaw} — couldn't identify the mint, skipping (not counted toward the wallet's favor)`)
        continue
      }
      const price = await getUsdPrice(bestMint.mint)
      const feeUi = Number(feeAmountRaw) / 10 ** bestMint.decimals
      const feeUsd = feeUi * price
      totalRealFeeUsd += feeUsd
      swapCount++
      console.log(`  ${signature.slice(0, 20)}... fee=${feeUi.toFixed(6)} of ${bestMint.mint.slice(0, 6)} ≈ $${feeUsd.toFixed(4)} (today's price)`)
    }
  }

  const maxPossibleVolumeUsd = totalRealFeeUsd / (MIN_EFFECTIVE_FEE_BPS / 10000)

  console.log(`\n--- Summary ---`)
  console.log(`Transactions scanned: ${allSignatures.length} (${fetchFailures} fetch/match failures — see warnings above if >0)`)
  console.log(`Real record_swap transactions found: ${swapCount}`)
  console.log(`Total real fee ever paid (today's prices): $${totalRealFeeUsd.toFixed(4)}`)
  console.log(
    `Most generous possible real volume (assumes King-tier 50% discount on every swap): $${maxPossibleVolumeUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
  )
  console.log(`Claimed cumulative volume (drives LUCK/RANK):                              $${claimedVolumeUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)

  if (claimedVolumeUsd > maxPossibleVolumeUsd * 1.5) {
    console.log(`\n⚠️  SUSPICIOUS: claimed volume is ${(claimedVolumeUsd / Math.max(maxPossibleVolumeUsd, 0.01)).toFixed(1)}x what real fees could possibly support.`)
  } else {
    console.log(`\n✅ Claimed volume is consistent with real fees paid — no sign of inflation.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
