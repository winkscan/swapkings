import { PublicKey, SystemProgram, VersionedTransaction, type Connection } from '@solana/web3.js'
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { BN } from '@coral-xyz/anchor'
import type { TransactionInstruction } from '@solana/web3.js'
import {
  getQuote,
  getSwapInstructions,
  buildSwapAndCommitTx,
  PLATFORM_FEE_BPS,
  MIN_FEE_AMOUNT,
  MAX_JUPITER_ROUTE_ACCOUNTS_FALLBACK,
} from './jupiter'
import { getProgram } from './anchorClient'
import {
  playerStatsPda,
  feeVaultAuthorityPda,
  feeVaultTokenAccount,
  guildFillerPda,
  referrerFillerPda,
  ZERO_PUBKEY,
} from './pdas'
import { fetchPlayerStats, discountBpsForVolumeCents } from './playerStats'
import { decodeGuild } from './accountDecode'
import { getTokenProgramId } from './tokenProgram'
import { getUsdPrices } from './jupiterInfo'
import { wasCancelled } from './walletErrors'
import { normalizeSignature } from './signature'

// Mobile port of app/src/swapExecutor.ts. The math, the fee split, the
// filler-account plumbing and every on-chain-behaviour comment carry over
// unchanged — the ONLY differences are the wallet boundary:
//   web:    an AnchorWallet + wallet-adapter's sendTransaction(tx, connection)
//   mobile: the caller's PublicKey + a signAndSendTransaction(tx, minContextSlot)
//           that runs inside a Mobile Wallet Adapter transact() session.
// The Anchor Program is built with a NON-signing provider here (see
// anchorClient.ts) because it is only ever used to read PlayerStats/Guild and
// to BUILD the record_swap instruction, never to sign or send.

export interface ExecuteSwapResult {
  sig: string
  // The blockhash's last valid block height — hand this to confirmSignature.
  lastValidBlockHeight: number
  // Raw units the swap instruction itself produced, before the platform fee
  // (if any) is deducted — purely informational.
  outAmount: string
  // Raw units of the output mint the wallet is actually left holding after
  // this swap — outAmount minus whatever record_swap just pulled out of that
  // same output-mint ATA (zero fee if this swap was too small to record).
  netOutAmount: string
  // False when the swap was too small for its (already LUCK-discounted) fee
  // to clear MIN_FEE_AMOUNT — the swap itself still went through, it just
  // didn't count toward LUCK/guild/referrer, since record_swap was skipped
  // entirely rather than sent and left to fail.
  recordedForRank: boolean
  // Raw units of the output mint that went straight to the current guild's
  // founder as this swap's own house-fee split — null when the wallet isn't
  // in a guild. Mirrors record_swap.rs's own integer bps split exactly.
  guildFounderAmount: string | null
  // The guild's own token mint (e.g. UFD, MOODENG) — so the success screen
  // can show WHICH house got paid. Only fetched when guildFounderAmount is
  // actually non-null.
  guildTokenMint: string | null
}

// Mirrors constants.rs's own values — duplicated here for the same reason
// PLATFORM_FEE_BPS/MIN_FEE_AMOUNT already are (see jupiter.ts): purely for
// the success-screen display figure. record_swap.rs computes the real split
// itself on-chain regardless of what this file assumes.
const GUILD_FOUNDER_SHARE_BPS = 9_000
const GUILD_FOUNDER_SHARE_WITH_REF_BPS = 4_000

export interface ExecuteSwapParams {
  connection: Connection
  walletPublicKey: PublicKey
  // From useMobileWallet(): opens a fresh MWA transact() session, authorizes,
  // calls wallet.signAndSendTransactions, returns the signature. The wallet
  // itself submits to the network, so nothing here calls sendRawTransaction.
  signAndSendTransaction: (
    transaction: VersionedTransaction,
    minContextSlot: number,
  ) => Promise<string>
  inputMint: string
  outputMint: string
  amount: string
  // The caller already knows this (it's what the UI displays), so it's passed
  // straight through for the on-chain usd_cents calc below instead of this
  // file re-fetching it from Jupiter — one fewer network call, and no risk of
  // a transient lookup failure corrupting a wallet's permanent lifetime volume.
  outputDecimals: number
  // Resolved owner of a pending ?ref=<code> link, if any — only actually used
  // when this wallet doesn't already have a referrer (record_swap ignores it
  // otherwise; referrer attribution is permanent, set once).
  referrerArg?: PublicKey | null
}

const SEND_RETRY_DELAY_MS = 1_000

// The RPC's own rejection when a compiled transaction is too big to even
// submit — literal text from the validator ("... VersionedTransaction too
// large: N bytes (max: encoded/raw 1644/1232)"), thrown straight out of
// connection.simulateTransaction() rather than coming back as sim.value.err.
// Confirmed live 2026-08-26 on a wallet with both a guild AND a referrer set,
// whose 5 extra per-wallet accounts can't be compressed via SWAP_LOOKUP_TABLE.
// A blind identical retry would hit the same wall; this needs a smaller route.
function isTxTooLargeError(err: unknown): boolean {
  return err instanceof Error && /too large/i.test(err.message) && /VersionedTransaction/i.test(err.message)
}

// One self-contained swap+record: quote -> build tx -> simulate -> sign+send.
// Retries once, for two distinct known-recoverable cases:
// - tx-too-large (see isTxTooLargeError): retries with a tighter Jupiter route
//   budget so the compiled message actually fits.
// - anything else (wallet/network flakiness after simulation already passed):
//   retries with a completely fresh quote and blockhash.
// NOT worth retrying a rejected signature (the user's own choice) or a real
// on-chain simulation failure (a fresh quote won't fix a genuine problem).
export async function executeSwap(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
  try {
    return await executeSwapOnce(params)
  } catch (err) {
    if (wasCancelled(err) || (err instanceof Error && err.message.startsWith('Simulation failed:'))) {
      throw err
    }
    if (isTxTooLargeError(err)) {
      console.warn('Swap transaction too large, retrying with a tighter route budget:', err)
      return await executeSwapOnce(params, MAX_JUPITER_ROUTE_ACCOUNTS_FALLBACK)
    }
    console.warn('Swap send failed, retrying once with a fresh quote:', err)
    await new Promise((r) => setTimeout(r, SEND_RETRY_DELAY_MS))
    return await executeSwapOnce(params)
  }
}

async function executeSwapOnce(
  {
    connection,
    walletPublicKey,
    signAndSendTransaction,
    inputMint,
    outputMint,
    amount,
    outputDecimals,
    referrerArg,
  }: ExecuteSwapParams,
  maxAccounts?: number,
): Promise<ExecuteSwapResult> {
  const quote = await getQuote({ inputMint, outputMint, amount, maxAccounts })

  const swapIx = await getSwapInstructions({
    quoteResponse: quote,
    userPublicKey: walletPublicKey.toBase58(),
  })

  const program = getProgram(connection, walletPublicKey)
  const outputMintPk = new PublicKey(outputMint)

  // A wallet's LUCK tier discount, current guild and referrer all live in
  // PlayerStats. One extra read per swap in exchange for record_swap never
  // trusting a client-supplied discount/guild/referrer directly.
  const playerStats = await fetchPlayerStats(connection, walletPublicKey)
  const discountBps = discountBpsForVolumeCents(playerStats.cumulativeVolumeCents)

  const flatFee = new BN(quote.outAmount).muln(PLATFORM_FEE_BPS).divn(10_000)
  const feeAmount = flatFee.muln(10_000 - discountBps).divn(10_000)

  // Gate on the PRE-discount flatFee, not the post-discount feeAmount: a
  // wallet's own tier discount (up to 50% at Kraken) can legitimately shrink
  // feeAmount, even to exactly 0 for a dust-sized swap, without the swap
  // itself being too small to record. Only a flatFee that itself can't clear
  // MIN_FEE_AMOUNT is genuine dust — that case skips record_swap entirely
  // rather than sending it and letting the whole atomic transaction fail.
  const recordedForRank = flatFee.gten(MIN_FEE_AMOUNT)

  const extraInstructions: TransactionInstruction[] = []
  let guildFounderAmount: BN | null = null
  let guildTokenMint: string | null = null

  if (recordedForRank) {
    // usd_cents feeds lifetime volume (Lucky Score) on-chain, so it has to be
    // a real USD estimate — outAmount alone isn't one, since it's in whatever
    // decimals the output mint uses. Decimals comes from the caller.
    const outputUsdPrice = (await getUsdPrices([outputMint]))[outputMint] ?? 0
    const outputUiAmount = Number(quote.outAmount) / 10 ** outputDecimals
    const usdCents = new BN(Math.round(outputUiAmount * outputUsdPrice * 100))
    const feeUiAmount = Number(feeAmount.toString()) / 10 ** outputDecimals
    // x10,000 (not whole cents) — a guild's/referrer's 50-90% share of a
    // small swap's fee can be well under a cent, and record_swap's on-chain
    // integer split math needs the precision or it truncates to zero.
    const feeUsdE4 = new BN(Math.round(feeUiAmount * outputUsdPrice * 10_000))

    // Token-2022 mints (most current pump.fun/letsbonk tokens) derive their
    // ATA against a different program — bake the real owning program in or
    // every ATA below silently computes the wrong address.
    const tokenProgramId = await getTokenProgramId(connection, outputMintPk)
    const depositorFeeTokenAccount = getAssociatedTokenAddressSync(
      outputMintPk,
      walletPublicKey,
      false,
      tokenProgramId,
    )

    const hasGuild = !playerStats.currentGuild.equals(ZERO_PUBKEY)
    const hasReferrer = !playerStats.referrer.equals(ZERO_PUBKEY)
    if (hasGuild) {
      const guildBps = hasReferrer ? GUILD_FOUNDER_SHARE_WITH_REF_BPS : GUILD_FOUNDER_SHARE_BPS
      guildFounderAmount = feeAmount.muln(guildBps).divn(10_000)
      // Manual decode, not program.account.guild.fetch() — see
      // accountDecode.ts's own comment for why (a real Hermes-only crash in
      // Anchor's coder, confirmed live 2026-09-11).
      const guildInfo = await connection.getAccountInfo(playerStats.currentGuild)
      if (!guildInfo) {
        throw new Error(`Guild account ${playerStats.currentGuild.toBase58()} not found on-chain`)
      }
      guildTokenMint = decodeGuild(guildInfo.data).tokenMint.toBase58()
    }
    const feeVaultAuthority = feeVaultAuthorityPda()
    // Filler accounts when there's no real guild/referrer yet — record_swap
    // only transfers to these when the corresponding field is actually set,
    // so an inert filler here is always safe. Must be two DISTINCT fillers,
    // distinct from fee_vault_authority (a real bug otherwise — collapses 3
    // token accounts into 1, Anchor rejects the duplicate mutable account).
    const guildFounderWallet = hasGuild ? playerStats.currentGuildFounderWallet : guildFillerPda()
    const referrerToRecord = hasReferrer ? playerStats.referrer : referrerArg ?? ZERO_PUBKEY
    // Mirror record_swap.rs's referrer_wallet constraint exactly:
    // player_stats.referrer once set, else a valid referrer_arg, else filler.
    const referrerArgIsValid =
      !!referrerArg && !referrerArg.equals(ZERO_PUBKEY) && !referrerArg.equals(walletPublicKey)
    const referrerWallet = hasReferrer
      ? playerStats.referrer
      : referrerArgIsValid
        ? referrerArg!
        : referrerFillerPda()

    // `guild` must be explicitly `null` (not omitted) when there's no guild
    // to bump — omitting the key throws "Account `X` not provided" from
    // Anchor's TS client even for an Option<Account>. The `as any` works
    // around an Anchor TS SDK typing limitation (ResolvedAccounts stops
    // resolving once a program has enough instructions/accounts). Field
    // names are verified against record_swap.rs's #[derive(Accounts)].
    const recordIx: TransactionInstruction = await program.methods
      .recordSwap(usdCents, feeAmount, feeUsdE4, referrerToRecord)
      .accounts({
        depositor: walletPublicKey,
        playerStats: playerStatsPda(walletPublicKey),
        mint: outputMintPk,
        depositorFeeTokenAccount,
        feeVaultAuthority,
        feeVaultTokenAccount: feeVaultTokenAccount(outputMintPk, tokenProgramId),
        guildFiller: guildFillerPda(),
        guildFounderWallet,
        guildFounderTokenAccount: getAssociatedTokenAddressSync(
          outputMintPk,
          guildFounderWallet,
          true,
          tokenProgramId,
        ),
        referrerFiller: referrerFillerPda(),
        referrerWallet,
        referrerTokenAccount: getAssociatedTokenAddressSync(
          outputMintPk,
          referrerWallet,
          true,
          tokenProgramId,
        ),
        guild: hasGuild ? playerStats.currentGuild : null,
        tokenProgram: tokenProgramId,
      } as any)
      .instruction()

    // When the output side is native SOL, Jupiter's own wrapAndUnwrapSol
    // cleanup unwraps (and closes) the temporary Wrapped SOL account as its
    // LAST step — so by the time recordIx runs, depositor_fee_token_account
    // no longer exists. Re-wrap just enough for the fee, positioned after
    // Jupiter's cleanup (these go directly before recordIx).
    if (outputMintPk.equals(NATIVE_MINT)) {
      extraInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          walletPublicKey,
          depositorFeeTokenAccount,
          walletPublicKey,
          NATIVE_MINT,
        ),
        SystemProgram.transfer({
          fromPubkey: walletPublicKey,
          toPubkey: depositorFeeTokenAccount,
          lamports: BigInt(feeAmount.toString()),
        }),
        createSyncNativeInstruction(depositorFeeTokenAccount),
      )
    }
    extraInstructions.push(recordIx)
  }

  const tx = await buildSwapAndCommitTx({
    connection,
    payer: walletPublicKey,
    swapIx,
    extraInstructions,
  })

  // minContextSlot + lastValidBlockHeight for the MWA send and for
  // confirmSignature afterwards. buildSwapAndCommitTx fetched its own
  // (slightly earlier) blockhash for the message; a fresh context slot here
  // is fine — the wallet only uses minContextSlot to make sure its RPC node
  // isn't lagging, and a value at or just ahead of the message's blockhash
  // slot satisfies that either way.
  const {
    context: { slot: minContextSlot },
    value: { lastValidBlockHeight },
  } = await connection.getLatestBlockhashAndContext()

  // Simulate first so a real failure surfaces its actual on-chain reason
  // instead of MWA's opaque generic error. This also drives the
  // isTxTooLargeError retry above.
  const txSize = tx.serialize().length
  const sim = await connection.simulateTransaction(tx, { sigVerify: false })
  if (sim.value.err) {
    console.error('Swap simulation failed:', sim.value.err, '\nsize:', txSize, 'bytes\nlogs:', sim.value.logs)
    throw new Error(
      `Simulation failed: ${JSON.stringify(sim.value.err)} (tx size ${txSize}/1232 bytes)\n` +
        `in=${quote.inAmount} of ${inputMint.slice(0, 4)} out=${quote.outAmount} of ${outputMint.slice(0, 4)} fee=${feeAmount.toString()}\n` +
        `${(sim.value.logs ?? []).slice(-8).join('\n')}`,
    )
  }

  // normalizeSignature: MWA's web3js layer can hand back a base64 signature
  // where base58 is expected (see signature.ts) — a harmless no-op otherwise.
  let rawSig: string
  try {
    rawSig = await signAndSendTransaction(tx, minContextSlot)
  } catch (err) {
    // Tag which step actually failed — simulation above already passed, so
    // whatever this throws is either the MWA session itself or normalizing/
    // sending, not an on-chain rejection. Keeps the original message intact
    // (as a substring) so executeSwap's own wasCancelled/isTxTooLargeError
    // checks upstream still match.
    const msg = err instanceof Error ? err.message : String(err)
    const wrapped = new Error(`MWA sign/send failed: ${msg}`)
    if (err instanceof Error) wrapped.stack = err.stack
    throw wrapped
  }
  const sig = normalizeSignature(rawSig)
  const netOutAmount = recordedForRank
    ? new BN(quote.outAmount).sub(feeAmount).toString()
    : quote.outAmount
  return {
    sig,
    lastValidBlockHeight,
    outAmount: quote.outAmount,
    netOutAmount,
    recordedForRank,
    guildFounderAmount: guildFounderAmount ? guildFounderAmount.toString() : null,
    guildTokenMint,
  }
}
