import { useEffect, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsUpDown, faArrowRight, faChevronDown, faCircleCheck, faCircleXmark, faShield } from '@fortawesome/free-solid-svg-icons'
import { getQuote, PLATFORM_FEE_BPS, MIN_FEE_AMOUNT, type QuoteResponse } from './jupiter'
import { getTokenInfos, getUsdPrices } from './jupiterInfo'
import { getTokenInfoBatched } from './tokenInfoBatch'
import { executeSwap } from './swapExecutor'
import { usePendingReferralCode, resolveReferralCode } from './useReferral'
import { TokenBadge } from './components/TokenBadge'
import { TokenSelectModal } from './components/TokenSelectModal'
import { RankCard } from './components/RankCard'
import { Modal } from './components/Modal'
import { shortAddr, solscanTxUrl, formatUsdCompact, toRawUnits, fromRawUnits, rawToHumanExact } from './format'
import { getTokenProgramId } from './tokenProgram'
import { wasCancelled, friendlyErrorMessage } from './walletErrors'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export function SwapPanel() {
  const { connection } = useConnection()
  const { connected, sendTransaction } = useWallet()
  const { setVisible: setWalletModalVisible } = useWalletModal()
  const wallet = useAnchorWallet()
  const [inputMint, setInputMint] = useState(SOL_MINT)
  const [outputMint, setOutputMint] = useState(USDC_MINT)
  const [amount, setAmount] = useState('0.01') // human-readable, in units of inputMint (0.01 SOL)
  const [inputDecimals, setInputDecimals] = useState(9) // SOL's decimals, until the real lookup resolves
  const [outputDecimals, setOutputDecimals] = useState(6) // USDC's decimals, ditto
  const [inputSymbol, setInputSymbol] = useState('SOL')
  const [outputSymbol, setOutputSymbol] = useState('USDC')
  const [inputPrice, setInputPrice] = useState(0) // USD price per whole token, ditto
  const [outputPrice, setOutputPrice] = useState(0)
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [status, setStatus] = useState('')
  const [editingIn, setEditingIn] = useState(false)
  const [editingOut, setEditingOut] = useState(false)
  const [pickerFor, setPickerFor] = useState<'in' | 'out' | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [swapResult, setSwapResult] = useState<{
    sig: string
    inAmount: string
    inMint: string
    outAmount: string
    outMint: string
    recordedForRank: boolean
    guildFounderAmount: string | null
    guildTokenMint: string | null
  } | null>(null)
  const [guildFounderSymbol, setGuildFounderSymbol] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<unknown>(undefined)
  const [inputBalance, setInputBalance] = useState<number | null>(null)
  // Exact raw-unit balance, kept alongside inputBalance's lossy float uiAmount
  // — the MAX button needs this to avoid rounding a large balance up past
  // what's actually on-chain (see rawToHumanExact in format.ts).
  const [inputBalanceRaw, setInputBalanceRaw] = useState<string | null>(null)

  // Captured once from ?ref=<code> (or a prior page load's cache) and
  // resolved to the referring wallet — only actually used by executeSwap if
  // this wallet doesn't already have a referrer of its own (see
  // swapExecutor.ts / useReferral.ts).
  const pendingReferralCode = usePendingReferralCode()
  const [pendingReferrer, setPendingReferrer] = useState<PublicKey | null>(null)
  useEffect(() => {
    if (!pendingReferralCode) return
    let cancelled = false
    resolveReferralCode(connection, pendingReferralCode).then((pk) => {
      if (!cancelled) setPendingReferrer(pk)
    })
    return () => {
      cancelled = true
    }
  }, [connection, pendingReferralCode])

  useEffect(() => {
    let cancelled = false
    Promise.all([getTokenInfos([inputMint, outputMint]), getUsdPrices([inputMint, outputMint])]).then(
      ([infos, prices]) => {
        if (cancelled) return
        if (infos[inputMint]) {
          setInputDecimals(infos[inputMint].decimals)
          setInputSymbol(infos[inputMint].symbol)
        }
        if (infos[outputMint]) {
          setOutputDecimals(infos[outputMint].decimals)
          setOutputSymbol(infos[outputMint].symbol)
        }
        setInputPrice(prices[inputMint] ?? 0)
        setOutputPrice(prices[outputMint] ?? 0)
      },
    )
    return () => {
      cancelled = true
    }
  }, [inputMint, outputMint])

  // Which house got paid, for the success modal's "X went to <house> house
  // founder" line — fetched only once a swap actually lands and turns out
  // to have a guild founder amount, keyed on the mint so it doesn't refetch
  // needlessly if the same house is hit again in a row.
  useEffect(() => {
    const mint = swapResult?.guildTokenMint
    if (!mint) {
      setGuildFounderSymbol(null)
      return
    }
    let cancelled = false
    getTokenInfoBatched(mint).then((info) => {
      if (!cancelled && info) setGuildFounderSymbol(info.symbol)
    })
    return () => {
      cancelled = true
    }
  }, [swapResult?.guildTokenMint])

  // Balance of whatever's currently selected to sell — native SOL reads the
  // wallet's raw lamport balance (that's what Jupiter's wrapAndUnwrapSol pulls
  // from, not an existing Wrapped SOL account), everything else reads its ATA.
  useEffect(() => {
    if (!wallet) {
      setInputBalance(null)
      setInputBalanceRaw(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        let mintPk: PublicKey
        try {
          mintPk = new PublicKey(inputMint)
        } catch {
          if (!cancelled) {
            setInputBalance(null)
            setInputBalanceRaw(null)
          }
          return
        }
        if (mintPk.equals(NATIVE_MINT)) {
          const lamports = await connection.getBalance(wallet!.publicKey)
          if (!cancelled) {
            setInputBalance(lamports / LAMPORTS_PER_SOL)
            setInputBalanceRaw(lamports.toString())
          }
        } else {
          // Derive the ATA against the mint's real owning program — Token-2022
          // ATAs use a different address entirely, so a plain (classic-program)
          // derivation silently points at a non-existent account for any
          // Token-2022 mint (e.g. a pump.fun graduate like SLOWLANA), the
          // balance read throws, and the wallet looks empty: MAX vanishes and
          // the "insufficient balance" guard blocks a swap the wallet can
          // actually afford. Same fix pattern as pdas.ts / swapExecutor.ts.
          const tokenProgramId = await getTokenProgramId(connection, mintPk)
          const ata = getAssociatedTokenAddressSync(mintPk, wallet!.publicKey, false, tokenProgramId)
          const bal = await connection.getTokenAccountBalance(ata)
          if (!cancelled) {
            setInputBalance(bal.value.uiAmount ?? 0)
            setInputBalanceRaw(bal.value.amount)
          }
        }
      } catch {
        // No token account for this mint at all — wallet holds none of it.
        if (!cancelled) {
          setInputBalance(0)
          setInputBalanceRaw('0')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [connection, wallet, inputMint])

  const handleFlip = () => {
    const prevIn = inputMint
    const prevInDecimals = inputDecimals
    const prevInPrice = inputPrice
    setInputMint(outputMint)
    setOutputMint(prevIn)
    setInputDecimals(outputDecimals)
    setOutputDecimals(prevInDecimals)
    setInputPrice(outputPrice)
    setOutputPrice(prevInPrice)
    setQuote(null)
  }

  const rawAmount = toRawUnits(amount, inputDecimals)

  const handleQuote = async () => {
    setStatus('Fetching quote from Jupiter…')
    setQuote(null)
    try {
      const q = await getQuote({ inputMint, outputMint, amount: rawAmount })
      setQuote(q)
      setStatus(
        `Quote: ${fromRawUnits(q.inAmount, inputDecimals)} ${inputSymbol} → ${fromRawUnits(q.outAmount, outputDecimals)} ${outputSymbol}\nPrice impact ${Number(q.priceImpactPct).toFixed(2)}%`,
      )
    } catch (err) {
      console.error(err)
      setStatus(`Quote failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Auto-refreshes the quote shortly after the amount (or either token) changes —
  // matches how real swap UIs behave, so "Get Quote" is a manual refresh option
  // rather than a required step. Debounced so we don't fire a request per keystroke.
  useEffect(() => {
    if (Number(amount) <= 0) return
    const timer = setTimeout(() => {
      handleQuote()
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMint, outputMint, amount, inputDecimals, outputDecimals])

  const handleSwap = async () => {
    if (!quote || !wallet) return
    setSwapping(true)
    setStatus('Building swap transaction…')
    try {
      const { sig, recordedForRank, guildFounderAmount, guildTokenMint } = await executeSwap({
        connection,
        wallet,
        sendTransaction,
        inputMint,
        outputMint,
        amount: rawAmount,
        outputDecimals,
        referrerArg: pendingReferrer,
      })
      setStatus('')
      setSwapResult({
        sig,
        inAmount: fromRawUnits(quote.inAmount, inputDecimals),
        inMint: inputMint,
        outAmount: fromRawUnits(quote.outAmount, outputDecimals),
        outMint: outputMint,
        recordedForRank,
        guildFounderAmount: guildFounderAmount ? fromRawUnits(guildFounderAmount, outputDecimals) : null,
        guildTokenMint,
      })
    } catch (err) {
      console.error(err)
      setStatus('')
      setSwapError(err)
    } finally {
      setSwapping(false)
    }
  }

  const handlePrimaryClick = () => {
    if (!connected) {
      setWalletModalVisible(true)
      return
    }
    handleSwap()
  }

  // Same formula record_swap uses on-chain (fee = output * PLATFORM_FEE_BPS/10000,
  // before any RANK-tier discount, which is computed inside executeSwap itself
  // right before sending). Below this, executeSwap skips record_swap and just
  // does the swap on its own (see swapExecutor.ts) — so this is informational,
  // never a reason to block the button: the swap itself always works regardless
  // of size.
  const feeAmount = quote ? Math.floor((Number(quote.outAmount) * PLATFORM_FEE_BPS) / 10_000) : 0
  const feeTooSmall = quote !== null && feeAmount < MIN_FEE_AMOUNT
  const minQualifyingOutput = fromRawUnits(String(Math.ceil((MIN_FEE_AMOUNT * 10_000) / PLATFORM_FEE_BPS)), outputDecimals)

  const primaryLabel = !connected ? 'Connect' : swapping ? 'Swapping…' : 'Swap'
  const primaryDisabled = connected && (!quote || swapping)

  const sellUsdValue = Number(amount || 0) * inputPrice
  const buyUsdValue = quote ? Number(fromRawUnits(quote.outAmount, outputDecimals)) * outputPrice : 0

  const insufficientBalance = connected && inputBalance !== null && Number(amount || 0) > inputBalance

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
      <RankCard />
      <div className="card">
      <div style={{ position: 'relative' }}>
        <div className="card" style={{ background: 'var(--bg-input)', border: 'none', padding: 16, marginBottom: 22 }}>
          <div className="text-secondary" style={{ fontSize: 13, marginBottom: 8 }}>
            Sell
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setPickerFor('in')}
              style={{ background: 'transparent', border: 'none', padding: 0, flexShrink: 0 }}
            >
              <TokenBadge
                mint={inputMint}
                trailing={<FontAwesomeIcon icon={faChevronDown} size="xs" style={{ color: 'var(--text-secondary)' }} />}
              />
            </button>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                // Plain text + manual validation instead of type="number", which
                // renders using the OS/browser locale's decimal separator (a comma
                // on this machine) even though the value we send Jupiter always
                // needs a dot. Normalize any typed comma to a dot too, so a user
                // used to their own locale's separator still gets the right result.
                const v = e.target.value.replace(',', '.')
                if (/^\d*\.?\d*$/.test(v)) setAmount(v)
              }}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'right',
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 24,
              }}
            />
          </div>
          {editingIn ? (
            <input
              autoFocus
              type="text"
              placeholder="Mint address"
              value={inputMint}
              onChange={(e) => setInputMint(e.target.value)}
              onBlur={() => setEditingIn(false)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: '8px 0 0',
                fontSize: 12,
                textAlign: 'left',
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
              <div
                className="text-secondary"
                onClick={() => setEditingIn(true)}
                title="Click to edit mint address"
                style={{ fontSize: 12, cursor: 'text' }}
              >
                {shortAddr(inputMint)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {inputBalanceRaw !== null && inputBalanceRaw !== '0' && (
                  <button
                    onClick={() => {
                      let raw = BigInt(inputBalanceRaw)
                      if (inputMint === SOL_MINT) {
                        // Leaves a little SOL behind — sweeping the exact full
                        // balance would leave nothing to pay this same swap's
                        // own network fee with.
                        const reserve = 5_000_000n // 0.005 SOL
                        raw = raw > reserve ? raw - reserve : 0n
                      }
                      setAmount(rawToHumanExact(raw.toString(), inputDecimals))
                    }}
                    style={{
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    MAX
                  </button>
                )}
                <div className="text-secondary" style={{ fontSize: 12 }}>
                  {formatUsdCompact(sellUsdValue)}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleFlip}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: '50%',
            background: 'var(--bg)',
            border: '4px solid var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <FontAwesomeIcon icon={faArrowsUpDown} size="sm" />
        </button>

        <div className="card" style={{ background: 'var(--bg-input)', border: 'none', padding: 16, marginTop: 22 }}>
          <div className="text-secondary" style={{ fontSize: 13, marginBottom: 8 }}>
            Buy
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setPickerFor('out')}
              style={{ background: 'transparent', border: 'none', padding: 0, flexShrink: 0 }}
            >
              <TokenBadge
                mint={outputMint}
                trailing={<FontAwesomeIcon icon={faChevronDown} size="xs" style={{ color: 'var(--text-secondary)' }} />}
              />
            </button>
            <div
              className="text-secondary"
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'right',
                fontSize: 20,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {quote ? fromRawUnits(quote.outAmount, outputDecimals) : '0.00'}
            </div>
          </div>
          {editingOut ? (
            <input
              autoFocus
              type="text"
              placeholder="Mint address"
              value={outputMint}
              onChange={(e) => setOutputMint(e.target.value)}
              onBlur={() => setEditingOut(false)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: '8px 0 0',
                fontSize: 12,
                textAlign: 'left',
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
              <div
                className="text-secondary"
                onClick={() => setEditingOut(true)}
                title="Click to edit mint address"
                style={{ fontSize: 12, cursor: 'text' }}
              >
                {shortAddr(outputMint)}
              </div>
              <div className="text-secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                {formatUsdCompact(buyUsdValue)}
              </div>
            </div>
          )}
        </div>
      </div>

      {insufficientBalance && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            background: 'rgba(246, 104, 90, 0.12)',
            color: 'var(--negative)',
            borderRadius: 12,
            padding: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          Insufficient balance — you only have {Number(inputBalance!.toFixed(6))}{' '}
          <TokenBadge mint={inputMint} flat size={15} /> in your wallet.
        </div>
      )}

      {feeTooSmall && (
        <div
          className="text-secondary"
          style={{
            marginTop: 12,
            fontSize: 12,
            background: 'var(--bg-input)',
            borderRadius: 12,
            padding: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          This swap will still go through — it's just below the ~{minQualifyingOutput}{' '}
          <TokenBadge mint={outputMint} flat size={15} /> needed to count toward Rank.
        </div>
      )}

      <div className="swap-actions" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={handlePrimaryClick} disabled={primaryDisabled} className="primary" style={{ flex: 1, width: 'auto' }}>
          {primaryLabel}
        </button>
      </div>

      {status && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 12,
            marginBottom: 3,
            textAlign: 'center',
          }}
        >
          {status}
        </pre>
      )}

      {pickerFor && (
        <TokenSelectModal
          onSelect={(mint) => {
            if (pickerFor === 'in') setInputMint(mint)
            else setOutputMint(mint)
            setQuote(null)
          }}
          onClose={() => setPickerFor(null)}
        />
      )}

      {swapResult && (
        <Modal onClose={() => setSwapResult(null)}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 56, color: 'var(--positive)' }} />
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>Success</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginTop: 16,
                fontSize: 14,
              }}
            >
              <span>{swapResult.inAmount}</span>
              <TokenBadge mint={swapResult.inMint} flat />
              <FontAwesomeIcon icon={faArrowRight} size="xs" className="text-secondary" />
              <span>{swapResult.outAmount}</span>
              <TokenBadge mint={swapResult.outMint} />
            </div>
            {!swapResult.recordedForRank && (
              <div className="text-secondary" style={{ fontSize: 12, marginTop: 12 }}>
                Below the minimum fee — didn't count toward Rank this time.
              </div>
            )}
            {swapResult.guildFounderAmount && guildFounderSymbol && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12,
                  marginTop: 12,
                }}
              >
                <TokenBadge mint={swapResult.outMint} flat iconOnly size={14} />
                <span style={{ fontWeight: 600 }}>{swapResult.guildFounderAmount}</span>
                <span className="text-secondary">went to the</span>
                <FontAwesomeIcon icon={faShield} className="text-secondary" />
                <span style={{ fontWeight: 600 }}>{guildFounderSymbol}</span>
                <span className="text-secondary">token founder</span>
              </div>
            )}
            <a
              href={solscanTxUrl(swapResult.sig)}
              target="_blank"
              rel="noreferrer"
              className="text-secondary"
              style={{ fontSize: 12, display: 'inline-block', marginTop: 16 }}
            >
              {shortAddr(swapResult.sig)}
            </a>
          </div>
        </Modal>
      )}

      {swapError !== undefined && (
        <Modal onClose={() => setSwapError(undefined)}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FontAwesomeIcon icon={faCircleXmark} style={{ fontSize: 56, color: '#ff5c5c' }} />
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>
              {wasCancelled(swapError) ? 'Cancelled' : 'Failed'}
            </div>
            {!wasCancelled(swapError) && (
              <div className="text-secondary" style={{ fontSize: 12, marginTop: 12, wordBreak: 'break-word' }}>
                {friendlyErrorMessage(swapError)}
              </div>
            )}
            <button onClick={() => setSwapError(undefined)} style={{ marginTop: 20 }}>
              Try again
            </button>
          </div>
        </Modal>
      )}
      </div>
    </div>
  )
}
