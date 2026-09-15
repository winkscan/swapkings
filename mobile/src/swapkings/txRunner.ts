import { useCallback } from 'react'
import { Transaction, type TransactionInstruction } from '@solana/web3.js'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { confirmSignature } from './confirmTx'
import { normalizeSignature } from './signature'

// The mobile equivalent of guildActions.ts / useReferral.ts's `sendAndConfirm`
// on web: take a set of instructions, wrap them in a legacy Transaction, run
// them through a Mobile Wallet Adapter session, wait for on-chain
// confirmation. Instruction order is preserved (matters for the ed25519
// attestation that must sit right before join_guild).
export function useTxRunner() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const { signAndSendTransaction } = useMobileWallet()

  return useCallback(
    async (ixs: TransactionInstruction | TransactionInstruction[]): Promise<string> => {
      if (!selectedAccount) throw new Error('Connect a wallet first')
      const list = Array.isArray(ixs) ? ixs : [ixs]
      const tx = new Transaction().add(...list)
      tx.feePayer = selectedAccount.publicKey

      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext()
      tx.recentBlockhash = blockhash

      // Pre-flight simulate so a real on-chain failure surfaces its actual
      // reason (program error + logs) instead of MWA's opaque generic error.
      const sim = await connection.simulateTransaction(tx)
      if (sim.value.err) {
        console.error('Tx simulation failed:', sim.value.err, '\nlogs:', sim.value.logs)
        throw new Error(
          `Simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).slice(-8).join('\n')}`,
        )
      }

      const sig = normalizeSignature(await signAndSendTransaction(tx, minContextSlot))
      await confirmSignature(connection, sig, lastValidBlockHeight)
      return sig
    },
    [connection, selectedAccount, signAndSendTransaction],
  )
}
