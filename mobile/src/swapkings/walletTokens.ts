import { LAMPORTS_PER_SOL, type Connection, type PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getTokenInfos, type TokenInfo } from './jupiterInfo'

export interface WalletToken extends TokenInfo {
  mint: string
  uiAmount: number
}

// Below this, treat a held token as a scam/impersonator airdrop rather than
// something worth offering to swap — a spoofed "USDC"/"COIN"/etc has no real
// pool behind it (Jupiter still indexes its name/symbol either way), so
// liquidity reliably sits near $0 while every real token, however small,
// clears this easily (confirmed live 2026-09-18: the wallet's actual junk —
// COIN, two fake "USDC" mints, TITS — all had ~$0 liquidity in Jupiter's own
// data). Not a market-cap floor like Guilds' own — this only needs to catch
// "no real pool exists," not gauge how big a real token's community is.
const WALLET_TOKEN_LIQUIDITY_FLOOR_USD = 1_000

// Real SPL token accounts the wallet holds, enriched with Jupiter's
// off-chain metadata so the Sell/Buy token pickers can show "what's
// actually in your wallet" alongside the preset list, with a balance next
// to each — same idea as the web app's own walletTokens.ts, but also
// queries Token-2022 accounts (a real gap on web, never hit there since
// none of its own presets are Token-2022, but this app's own Houses flow
// deals with real Token-2022 pump.fun graduates daily — see
// tokenProgram.ts's own comment on why that distinction is load-bearing).
export async function getWalletTokens(connection: Connection, owner: PublicKey): Promise<WalletToken[]> {
  const [classic, token2022, lamports] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    connection.getBalance(owner),
  ])
  const held = [...classic.value, ...token2022.value]
    .map((v) => v.account.data.parsed.info)
    .filter((info) => info.tokenAmount.uiAmount > 0)
    .map((info) => ({ mint: info.mint as string, uiAmount: info.tokenAmount.uiAmount as number }))

  if (lamports > 0) held.push({ mint: NATIVE_MINT.toBase58(), uiAmount: lamports / LAMPORTS_PER_SOL })
  if (held.length === 0) return []
  const infos = await getTokenInfos(held.map((h) => h.mint))

  return held
    .filter((h) => infos[h.mint] && (infos[h.mint].liquidityUsd ?? 0) >= WALLET_TOKEN_LIQUIDITY_FLOOR_USD)
    .map((h) => ({ mint: h.mint, uiAmount: h.uiAmount, ...infos[h.mint] }))
    .sort((a, b) => b.uiAmount - a.uiAmount)
}
