import { AnchorProvider, Program, type Wallet } from '@coral-xyz/anchor'
import type { Connection } from '@solana/web3.js'
import type { AnchorWallet } from '@solana/wallet-adapter-react'
import idl from './idl/solana_swap_rewards.json'
import type { SolanaSwapRewards } from './idl/solana_swap_rewards.ts'

// AnchorWallet (wallet-adapter-react) is missing the `payer: Keypair` field
// Anchor's own Wallet type declares — a browser wallet adapter never exposes
// a raw keypair, and nothing here ever calls `.rpc()` (the one Anchor helper
// that would actually touch `wallet.payer`), so the cast is safe. Same
// pattern readonlyWallet.ts already uses for its stub wallet.
export function getProgram(connection: Connection, wallet: AnchorWallet | Wallet): Program<SolanaSwapRewards> {
  const provider = new AnchorProvider(connection, wallet as Wallet, {
    commitment: 'confirmed',
  })
  return new Program<SolanaSwapRewards>(idl as SolanaSwapRewards, provider)
}
