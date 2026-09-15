import { Keypair } from '@solana/web3.js'
import type { Wallet } from '@coral-xyz/anchor'

// Anchor's Program needs a Wallet even to just fetch accounts read-only.
// Pages that only display public data (vault totals, past winners) shouldn't
// require the visitor to connect a wallet first, so this stub stands in
// until a real wallet connects. It can never sign — fine, since nothing here
// ever sends a transaction through a program built with it.
const stubKeypair = Keypair.generate()

export const readonlyWallet: Wallet = {
  publicKey: stubKeypair.publicKey,
  async signTransaction() {
    throw new Error('readonlyWallet cannot sign transactions')
  },
  async signAllTransactions() {
    throw new Error('readonlyWallet cannot sign transactions')
  },
} as unknown as Wallet
