import { LAMPORTS_PER_SOL, type Connection, type PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getTokenInfos, type TokenInfo } from './jupiterInfo'

export interface WalletToken extends TokenInfo {
  mint: string
  uiAmount: number
}

// Real SPL token accounts owned by the connected wallet, enriched with
// Jupiter's off-chain metadata so the deposit token-picker only ever offers
// tokens the user can actually deposit. Native SOL isn't an SPL token account at
// all (it's the wallet's own lamport balance), so getParsedTokenAccountsByOwner
// never returns it — added separately below, under the same "Wrapped SOL" mint
// the rest of the app already uses for SOL everywhere else. depositToPool then
// wraps it on the fly (see DepositPanel.tsx) since there's no real SPL balance
// to transfer until that happens.
export async function getWalletTokens(connection: Connection, owner: PublicKey): Promise<WalletToken[]> {
  const [{ value }, lamports] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getBalance(owner),
  ])
  const held = value
    .map((v) => v.account.data.parsed.info)
    .filter((info) => info.tokenAmount.uiAmount > 0)
    .map((info) => ({ mint: info.mint as string, uiAmount: info.tokenAmount.uiAmount as number }))

  if (lamports > 0) held.push({ mint: NATIVE_MINT.toBase58(), uiAmount: lamports / LAMPORTS_PER_SOL })
  if (held.length === 0) return []
  const infos = await getTokenInfos(held.map((h) => h.mint))

  return held
    .filter((h) => infos[h.mint])
    .map((h) => ({ mint: h.mint, uiAmount: h.uiAmount, ...infos[h.mint] }))
    .sort((a, b) => b.uiAmount - a.uiAmount)
}
