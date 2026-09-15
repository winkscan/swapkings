import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  PublicKey,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import { getProgram } from './anchorClient'
import {
  playerStatsPda,
  referralCodePda,
  randomReferralCode,
  referralCodeFromString,
  referralCodeToString,
} from './pdas'
import { decodeReferralCode } from './accountDecode'
import { wasCancelled } from './walletErrors'

const STORAGE_KEY = 'swapkings.pendingReferralCode.v1'

// On web this is captured from ?ref=<code> in the URL. On mobile there's no
// URL bar; a friend's code is entered manually (ReferralScreen) or, later,
// picked up from a deep link. Stored in AsyncStorage so it survives until the
// wallet's first swap actually writes it on-chain (record_swap is a no-op on
// referrer_arg once a referrer is already set — see swapExecutor.ts).
export function usePendingReferralCode(): {
  code: string | null
  setCode: (code: string | null) => void
  loading: boolean
} {
  const [code, setCodeState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setCodeState(v))
      .catch(() => setCodeState(null))
      .finally(() => setLoading(false))
  }, [])

  const setCode = useCallback((next: string | null) => {
    setCodeState(next)
    if (next) {
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
    }
  }, [])

  return { code, setCode, loading }
}

// Resolves a referral code to the wallet that claimed it — one deterministic
// PDA read, no scanning. null for an unclaimed/malformed code.
export async function resolveReferralCode(
  connection: Connection,
  code: string,
): Promise<PublicKey | null> {
  try {
    // Manual decode (decodeReferralCode), not Anchor's coder — see
    // accountDecode.ts's own comment for why (a real Hermes-only crash,
    // confirmed live 2026-09-11).
    const pda = referralCodePda(referralCodeFromString(code))
    const info = await connection.getAccountInfo(pda)
    if (!info) return null
    return decodeReferralCode(info.data).owner
  } catch {
    return null
  }
}

// Reads the stored pending code and resolves it to a PublicKey to pass as
// `referrerArg` into executeSwap. The screens call this (they have a
// Connection); returns null when there's no code or it doesn't resolve.
export async function resolvePendingReferrer(
  connection: Connection,
): Promise<PublicKey | null> {
  try {
    const code = await AsyncStorage.getItem(STORAGE_KEY)
    if (!code) return null
    return await resolveReferralCode(connection, code)
  } catch {
    return null
  }
}

export function referralLink(code: string): string {
  return `https://swapkings.app/?ref=${code}`
}

export async function buildClaimReferralIx(
  connection: Connection,
  walletPublicKey: PublicKey,
  code: Uint8Array,
): Promise<TransactionInstruction> {
  const program = getProgram(connection, walletPublicKey)
  return program.methods
    .claimReferralCode(Array.from(code))
    .accounts({
      depositor: walletPublicKey,
      playerStats: playerStatsPda(walletPublicKey),
      referralCode: referralCodePda(code),
    } as any)
    .instruction()
}

const CLAIM_MAX_ATTEMPTS = 5

// Generates a fresh random code and tries to claim it. On-chain `init`
// guarantees uniqueness, so a collision (astronomically rare) just means "try
// again with a different code" — not a hard failure. A wallet rejection is
// NOT a collision and must surface immediately rather than silently re-prompt.
export async function claimReferralCode(
  connection: Connection,
  walletPublicKey: PublicKey,
  runTx: (ixs: TransactionInstruction | TransactionInstruction[]) => Promise<string>,
): Promise<string> {
  for (let attempt = 1; attempt <= CLAIM_MAX_ATTEMPTS; attempt++) {
    const code = randomReferralCode()
    try {
      const ix = await buildClaimReferralIx(connection, walletPublicKey, code)
      await runTx(ix)
      return referralCodeToString(code)
    } catch (err) {
      if (wasCancelled(err) || attempt === CLAIM_MAX_ATTEMPTS) throw err
      console.warn(`Referral code claim collided (attempt ${attempt}), retrying:`, err)
    }
  }
  throw new Error('Could not claim a referral code after several attempts')
}
