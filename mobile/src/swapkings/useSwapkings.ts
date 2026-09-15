import { useCallback } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { getQuote, type QuoteResponse } from './jupiter'
import { executeSwap, type ExecuteSwapResult } from './swapExecutor'
import { confirmSignature } from './confirmTx'

// The one hook a screen needs to price and run a SwapKings swap on mobile.
// Wraps the ported business layer (jupiter + swapExecutor + confirmTx) around
// the scaffold's Mobile Wallet Adapter wiring.
export function useSwapkings() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const { signAndSendTransaction } = useMobileWallet()

  const quote = useCallback(
    (inputMint: string, outputMint: string, amount: string): Promise<QuoteResponse> =>
      getQuote({ inputMint, outputMint, amount }),
    [],
  )

  const swap = useCallback(
    async (params: {
      inputMint: string
      outputMint: string
      amount: string
      outputDecimals: number
      referrerArg?: PublicKey | null
    }): Promise<ExecuteSwapResult> => {
      if (!selectedAccount) {
        throw new Error('Connect a wallet first')
      }
      const result = await executeSwap({
        connection,
        walletPublicKey: selectedAccount.publicKey,
        signAndSendTransaction,
        ...params,
      })
      // MWA's signAndSendTransactions already submitted it; wait for the
      // network to confirm before the screen reports success.
      await confirmSignature(connection, result.sig, result.lastValidBlockHeight)
      return result
    },
    [connection, selectedAccount, signAndSendTransaction],
  )

  return {
    connection,
    account: selectedAccount,
    isConnected: !!selectedAccount,
    quote,
    swap,
  }
}
