import { AnchorProvider, Program, type Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey, type Connection } from '@solana/web3.js'
import idl from './idl/solana_swap_rewards.json'
import type { SolanaSwapRewards } from './idl/solana_swap_rewards'

// On web this took an `AnchorWallet` from wallet-adapter-react. Mobile Wallet
// Adapter has no persistent signing wallet object — every signature goes
// through a fresh `transact()` session — so the `Program` here is only ever
// used to READ accounts and BUILD instructions, never to sign or `.rpc()`.
// A non-signing stub wallet is therefore all it needs; the real signing
// happens in swapExecutor via useMobileWallet's signAndSendTransaction.
//
// Passing the connected wallet's real pubkey (when known) keeps
// provider.publicKey correct for any Anchor helper that reads it while
// building an instruction; it falls back to a throwaway key for pure reads
// before a wallet is connected.
function nonSigningWallet(publicKey: PublicKey): Wallet {
  return {
    publicKey,
    async signTransaction() {
      throw new Error('anchorClient wallet cannot sign — use useMobileWallet')
    },
    async signAllTransactions() {
      throw new Error('anchorClient wallet cannot sign — use useMobileWallet')
    },
  } as unknown as Wallet
}

const throwawayKey = Keypair.generate().publicKey

export function getProgram(
  connection: Connection,
  publicKey?: PublicKey | null,
): Program<SolanaSwapRewards> {
  const provider = new AnchorProvider(connection, nonSigningWallet(publicKey ?? throwawayKey), {
    commitment: 'confirmed',
  })
  return new Program<SolanaSwapRewards>(idl as SolanaSwapRewards, provider)
}
