import { PublicKey, SystemProgram, type Connection } from '@solana/web3.js'
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { BN } from '@coral-xyz/anchor'
import type { TransactionInstruction } from '@solana/web3.js'
import type { AnchorWallet, WalletContextState } from '@solana/wallet-adapter-react'
import {
  getQuote,
  getSwapInstructions,
  buildSwapAndCommitTx,
  PLATFORM_FEE_BPS,
  MIN_FEE_AMOUNT,
  MAX_JUPITER_ROUTE_ACCOUNTS_FALLBACK,
} from './jupiter'
import { getProgram } from './anchorClient'
import { playerStatsPda, feeVaultAuthorityPda, feeVaultTokenAccount, guildFillerPda, referrerFillerPda, ZERO_PUBKEY } from './pdas'
import { fetchPlayerStats, discountBpsForVolumeCents } from './playerStats'
import { getTokenProgramId } from './tokenProgram'
import { getUsdPrices } from './jupiterInfo'
import { wasCancelled } from './walletErrors'
import { normalizeSignature } from './signature'

export interface ExecuteSwapResult {
  sig: string
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
  // in a guild. Mirrors record_swap.rs's own integer bps split exactly (see
  // GUILD_FOUNDER_SHARE_BPS/GUILD_FOUNDER_SHARE_WITH_REF_BPS below), so this
  // matches the real on-chain transfer to the last raw unit rather than
  // being a rough estimate.
  guildFounderAmount: string | null
  // The guild's own token mint (e.g. UFD, MOODENG) — so the success modal
  // can show WHICH house got paid, not just that some house did. Only
  // fetched when guildFounderAmount is actually non-null.
  guildTokenMint: string | null
}

// Mirrors constants.rs's own values — duplicated here for the same reason
// PLATFORM_FEE_BPS/MIN_FEE_AMOUNT already are (see jupiter.ts): this is
// purely for the success-modal display figure, record_swap.rs computes the
// real split itself on-chain regardless of what this file assumes.
const GUILD_FOUNDER_SHARE_BPS = 9_000
const GUILD_FOUNDER_SHARE_WITH_REF_BPS = 4_000

interface ExecuteSwapParams {
  connection: Connection
  wallet: AnchorWallet
  sendTransaction: WalletContextState['sendTransaction']
  inputMint: string
  outputMint: string
  amount: string
  // The caller already knows this (it's what the UI displays), so it's
  // passed straight through for the on-chain usd_cents calc below instead of
  // this file re-fetching it from Jupiter's API — one fewer network call, and
  // no risk of a transient lookup failure writing a corrupted USD estimate
  // into a wallet's permanent lifetime-volume total (see below).
  outputDecimals: number
  // Resolved owner of a pending ?ref=<code> link, if any — only actually used
  // when this wallet doesn't already have a referrer (record_swap ignores it
  // otherwise; referrer attribution is permanent, set once).
  referrerArg?: PublicKey | null
}

const SEND_RETRY_DELAY_MS = 1_000

// The RPC's own rejection when a compiled transaction is too big to even
// submit — literal text from the validator itself ("failed to simulate
// transaction: base64 encoded solana_transaction::versioned::
// VersionedTransaction too large: N bytes (max: encoded/raw 1644/1232)"),
// thrown as an exception straight out of connection.simulateTransaction()
// rather than coming back as sim.value.err (that only covers a transaction
// small enough to actually reach on-chain simulation) — confirmed live
// 2026-08-26 on a wallet with both a guild AND a referrer set, whose 5 extra
// per-wallet accounts (founder wallet+ATA, referrer wallet+ATA, the guild
// account) can't be compressed via SWAP_LOOKUP_TABLE, combined with a
// multi-hop route. A blind identical retry (the generic path below) would
// just hit the same wall again; this needs a smaller route instead.
function isTxTooLargeError(err: unknown): boolean {
  return err instanceof Error && /too large/i.test(err.message) && /VersionedTransaction/i.test(err.message)
}

// One self-contained swap+record: quote -> build tx -> send. Retries once,
// for two distinct known-recoverable cases:
// - tx-too-large (see isTxTooLargeError above): retries with a tighter
//   Jupiter route budget (MAX_JUPITER_ROUTE_ACCOUNTS_FALLBACK) so the
//   compiled message actually fits, trading a little price optimality for
//   the swap going through at all.
// - anything else (typically the wallet adapter's generic "Internal error"
//   on sendTransaction itself — simulation already passed by that point, so
//   it's wallet/network flakiness, not a real on-chain rejection): retries
//   with a completely fresh quote and blockhash, same route budget.
// NOT worth retrying a rejected signature (the user's own choice, surface it
// right away) or a real on-chain simulation failure (sim.value.err — a fresh
// quote won't fix a genuine on-chain problem, only wastes time repeating it).
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
    wallet,
    sendTransaction,
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
    userPublicKey: wallet.publicKey.toBase58(),
  })

  const program = getProgram(connection, wallet)
  const outputMintPk = new PublicKey(outputMint)

  // Needed before the fee itself can even be computed: a wallet's LUCK tier
  // discount, current guild, and referrer all live here. One extra read per
  // swap in exchange for record_swap never having to trust a client-supplied
  // discount/guild/referrer directly — only the raw fee split math trusts the
  // client, same as usd_cents always has.
  const playerStats = await fetchPlayerStats(connection, wallet)
  const discountBps = discountBpsForVolumeCents(playerStats.cumulativeVolumeCents)

  const flatFee = new BN(quote.outAmount).muln(PLATFORM_FEE_BPS).divn(10_000)
  const feeAmount = flatFee.muln(10_000 - discountBps).divn(10_000)

  // Gate on the PRE-discount flatFee, not the post-discount feeAmount: a
  // wallet's own tier discount (up to 50% at Kraken, see constants.rs) can
  // legitimately shrink feeAmount, even to exactly 0 for a dust-sized swap,
  // without the swap itself being too small to bother recording. Gating on
  // feeAmount instead would have skipped record_swap for every swap a
  // high-tier wallet makes below its own discount threshold, freezing that
  // wallet's lifetime volume — confirmed as a real bug this session. Only a
  // flatFee that itself can't clear MIN_FEE_AMOUNT is genuine dust — that
  // case still skips record_swap entirely rather than sending it and letting
  // the whole atomic transaction (swap included) fail on-chain.
  const recordedForRank = flatFee.gten(MIN_FEE_AMOUNT)

  const extraInstructions: TransactionInstruction[] = []
  let guildFounderAmount: BN | null = null
  let guildTokenMint: string | null = null

  if (recordedForRank) {
    // usd_cents feeds lifetime volume (Lucky Score) on-chain, so it has to be
    // a real USD estimate — outAmount alone isn't one, since it's in whatever
    // decimals the output mint uses (6 for USDC, 9 for SOL, etc). Decimals
    // comes from the caller (see ExecuteSwapParams) rather than a fresh
    // lookup here — a fixed divisor once caused this to read SOL lamports as
    // if they were USDC base units.
    const outputUsdPrice = (await getUsdPrices([outputMint]))[outputMint] ?? 0
    const outputUiAmount = Number(quote.outAmount) / 10 ** outputDecimals
    const usdCents = new BN(Math.round(outputUiAmount * outputUsdPrice * 100))
    const feeUiAmount = Number(feeAmount.toString()) / 10 ** outputDecimals
    // x10,000 (not x100/whole cents) — a guild's or referrer's 50-90% share
    // of a small swap's fee can be well under a single cent (e.g. a $4 test
    // swap's 0.2% fee is $0.008), and record_swap's on-chain integer split
    // math needs real precision to work with or it truncates straight to
    // zero — confirmed live 2026-08-22: two real mainnet swaps with correct
    // real token transfers still left the guild's on-chain "$ earned"
    // counter at exactly 0 both times, traced to this exact rounding. See
    // state.rs's Guild::total_fees_earned_usd_e4 for the receiving side.
    const feeUsdE4 = new BN(Math.round(feeUiAmount * outputUsdPrice * 10_000))

    // ANSEM (and plenty of other current pump.fun/letsbonk tokens) are
    // Token-2022, not classic SPL Token — ATA derivation bakes the owning
    // token program into its own seeds, so every ATA below needs the real
    // one or it silently computes the wrong address entirely (confirmed
    // live: this was the actual cause of a real Guild join failing).
    const tokenProgramId = await getTokenProgramId(connection, outputMintPk)
    const depositorFeeTokenAccount = getAssociatedTokenAddressSync(outputMintPk, wallet.publicKey, false, tokenProgramId)

    const hasGuild = !playerStats.currentGuild.equals(ZERO_PUBKEY)
    const hasReferrer = !playerStats.referrer.equals(ZERO_PUBKEY)
    if (hasGuild) {
      const guildBps = hasReferrer ? GUILD_FOUNDER_SHARE_WITH_REF_BPS : GUILD_FOUNDER_SHARE_BPS
      guildFounderAmount = feeAmount.muln(guildBps).divn(10_000)
      // Single-account read (1 Helius credit) — only fires on the swaps that
      // actually need it (in a guild), purely for the success modal's "which
      // house" display; the real fund routing never depends on this fetch.
      const guild = await program.account.guild.fetch(playerStats.currentGuild)
      guildTokenMint = guild.tokenMint.toBase58()
    }
    const feeVaultAuthority = feeVaultAuthorityPda()
    // Filler accounts when there's no real guild/referrer yet — record_swap
    // only ever transfers to these when the corresponding current_guild/
    // referrer field is actually set, so passing an inert filler here is
    // always safe funds-wise (see record_swap.rs). Must be two DISTINCT
    // fillers, and distinct from fee_vault_authority — a real bug, hit live
    // 2026-08-22, came from both originally reusing fee_vault_authority
    // itself: that collapsed fee_vault_token_account/guild_founder_token_
    // account/referrer_token_account into the same address (all just "ATA
    // of this authority for this mint") the moment either guild or referrer
    // was inactive — the common case for most swaps — and Anchor's own
    // ConstraintDuplicateMutableAccount check rejected it outright.
    const guildFounderWallet = hasGuild ? playerStats.currentGuildFounderWallet : guildFillerPda()
    // referrer_arg is a no-op on-chain once a referrer is already set — only
    // matters the first time, when this wallet has none yet.
    const referrerToRecord = hasReferrer ? playerStats.referrer : referrerArg ?? ZERO_PUBKEY
    // Must mirror record_swap.rs's own referrer_wallet constraint exactly —
    // `player_stats.referrer` once set, else a valid referrer_arg (same
    // "not zero, not self" guard the handler uses before ever writing it to
    // player_stats.referrer), else referrer_filler. record_swap.rs validates
    // the referrer_wallet ACCOUNT against referrer_arg the instant it's about
    // to be set for the first time, so passing referrer_filler here whenever
    // referrerArg is a real, valid referrer throws ConstraintAddress
    // (confirmed live 2026-08-22: this line still unconditionally passed
    // referrerFillerPda() whenever hasReferrer was false, even after the
    // Rust-side fix started expecting referrer_arg's own ATA instead).
    const referrerArgIsValid = !!referrerArg && !referrerArg.equals(ZERO_PUBKEY) && !referrerArg.equals(wallet.publicKey)
    const referrerWallet = hasReferrer ? playerStats.referrer : referrerArgIsValid ? referrerArg! : referrerFillerPda()

    // `guild` must be explicitly set to `null` (not omitted) when there's no
    // guild to bump — verified against a real mainnet call on join_guild's
    // own Option<Account> (previousGuild): omitting the key throws "Account
    // `X` not provided" from Anchor's TS client, even though it's an
    // Option<Account> on the Rust side. The `as any` is a workaround for an
    // Anchor TS SDK typing limitation (ResolvedAccounts stops resolving to a
    // real object type once a program has enough instructions/accounts and
    // reports every valid field name as "does not exist") — not a runtime
    // issue. Field names below are verified directly against record_swap.rs's
    // #[derive(Accounts)].
    const recordIx: TransactionInstruction = await program.methods
      .recordSwap(usdCents, feeAmount, feeUsdE4, referrerToRecord)
      .accounts({
        depositor: wallet.publicKey,
        playerStats: playerStatsPda(wallet.publicKey),
        mint: outputMintPk,
        depositorFeeTokenAccount,
        feeVaultAuthority,
        feeVaultTokenAccount: feeVaultTokenAccount(outputMintPk, tokenProgramId),
        guildFiller: guildFillerPda(),
        guildFounderWallet,
        guildFounderTokenAccount: getAssociatedTokenAddressSync(outputMintPk, guildFounderWallet, true, tokenProgramId),
        referrerFiller: referrerFillerPda(),
        referrerWallet,
        referrerTokenAccount: getAssociatedTokenAddressSync(outputMintPk, referrerWallet, true, tokenProgramId),
        guild: hasGuild ? playerStats.currentGuild : null,
        // record_swap.rs's token_program is now Interface<TokenInterface> (see
        // that file's own comment) so it no longer has one fixed address for
        // Anchor's TS client to auto-resolve — has to be passed explicitly.
        tokenProgram: tokenProgramId,
      } as any)
      .instruction()

    // When the output side is native SOL, Jupiter's own wrapAndUnwrapSol
    // cleanup unwraps (and closes) the temporary Wrapped SOL account as the
    // LAST step of its own instructions — meaning by the time recordIx runs
    // right after, depositor_fee_token_account no longer exists
    // ("AccountNotInitialized"). Re-wrap just enough for the fee, positioned
    // after Jupiter's cleanup (these go directly before recordIx) so nothing
    // closes it again before recordIx runs.
    if (outputMintPk.equals(NATIVE_MINT)) {
      extraInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          depositorFeeTokenAccount,
          wallet.publicKey,
          NATIVE_MINT,
        ),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
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
    payer: wallet.publicKey,
    swapIx,
    extraInstructions,
  })

  // Simulate first so a real failure surfaces its actual on-chain reason
  // (program error, missing account, etc.) instead of just the wallet
  // adapter's generic "Internal error" — that message means the wallet
  // itself rejected/failed the send, with no detail passed back to us, so we
  // can't tell what went wrong without asking the network directly first.
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

  // normalizeSignature: see that function's own comment — some wallets
  // (via @solana-mobile/wallet-adapter-mobile's Wallet-Standard code path)
  // return this as base64 instead of the base58 every consumer of this
  // value (Solscan links, confirmSignature's RPC polling) actually expects.
  const sig = normalizeSignature(await sendTransaction(tx, connection))
  const netOutAmount = recordedForRank ? new BN(quote.outAmount).sub(feeAmount).toString() : quote.outAmount
  return {
    sig,
    outAmount: quote.outAmount,
    netOutAmount,
    recordedForRank,
    guildFounderAmount: guildFounderAmount ? guildFounderAmount.toString() : null,
    guildTokenMint,
  }
}
