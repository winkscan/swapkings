import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput, TouchableRipple } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, getAssociatedTokenAddressSync } from '@solana/spl-token'

import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useSwapkings } from '../swapkings/useSwapkings'
import type { QuoteResponse } from '../swapkings/jupiter'
import { getTokenInfos } from '../swapkings/jupiterInfo'
import { getTokenProgramId } from '../swapkings/tokenProgram'
import { friendlyErrorMessage, wasCancelled } from '../swapkings/walletErrors'
import { resolvePendingReferrer } from '../swapkings/referral'
import { fromRawUnits, shortAddr, toRawUnits } from '../swapkings/format'
import { Keypad } from '../components/Keypad'
import { TokenPill, type TokenOption } from '../components/TokenPill'
import { SwapResultOverlay, type SwapOutcome } from '../components/SwapResultOverlay'
import { SWAPKINGS_COLORS as C } from '../theme'

// Prototype token set — enough to exercise classic SPL (SOL/USDC/JUP) and a
// Token-2022 pump.fun graduate via the "paste a mint" option (Token-2022 ok).
const PRESETS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRg2r33fT3RnV3ycW7c7C9V', decimals: 5 },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
}
const PRESET_KEYS = Object.keys(PRESETS)
// Reserved so a MAX sell of SOL still leaves enough for network/rent fees.
const SOL_FEE_RESERVE = 0.003

export function SwapScreen() {
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const { swap, quote, connection } = useSwapkings()

  const [sellKey, setSellKey] = useState('SOL')
  const [buyKey, setBuyKey] = useState('USDC')
  const [customMint, setCustomMint] = useState<{ side: 'sell' | 'buy'; mint: string } | null>(
    null,
  )
  const [customDecimals, setCustomDecimals] = useState<number | null>(null)
  const [icons, setIcons] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState('0')

  const [quoting, setQuoting] = useState(false)
  const [quoteResp, setQuoteResp] = useState<QuoteResponse | null>(null)
  const [quoteErr, setQuoteErr] = useState<string | null>(null)

  const [swapping, setSwapping] = useState(false)
  const [overlay, setOverlay] = useState<{
    outcome: SwapOutcome
    inAmount?: string
    inToken?: TokenOption
    outAmount?: string
    outToken?: TokenOption
    recordedForRank?: boolean
    guildFounderAmount?: string | null
    guildTokenMint?: string | null
    guildToken?: TokenOption | null
    sig?: string
    errorMessage?: string
  } | null>(null)
  const [inputBalance, setInputBalance] = useState<number | null>(null)

  const sellIsCustom = customMint?.side === 'sell'
  const buyIsCustom = customMint?.side === 'buy'
  const inputMint = sellIsCustom ? customMint!.mint : PRESETS[sellKey].mint
  const inputDecimals = sellIsCustom ? customDecimals : PRESETS[sellKey].decimals
  const outputMint = buyIsCustom ? customMint!.mint : PRESETS[buyKey].mint
  const outputDecimals = buyIsCustom ? customDecimals : PRESETS[buyKey].decimals

  const sellSymbol = sellIsCustom ? shortAddr(customMint!.mint) : sellKey
  const buySymbol = buyIsCustom ? shortAddr(customMint!.mint) : buyKey

  // Fetch icons for the 4 presets once, and for whichever mint is currently
  // pasted as custom — purely cosmetic (TokenPill falls back to a plain
  // circle+letter if a lookup never resolves).
  useEffect(() => {
    const mints = [...new Set([...Object.values(PRESETS).map((p) => p.mint), inputMint, outputMint])]
    getTokenInfos(mints)
      .then((infos) => {
        const next: Record<string, string> = {}
        for (const [mint, info] of Object.entries(infos)) {
          if (info.icon) next[mint] = info.icon
        }
        setIcons((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMint, outputMint])

  // Resolve decimals for a pasted custom mint (either side).
  useEffect(() => {
    let cancelled = false
    setCustomDecimals(null)
    if (!customMint) return
    getTokenInfos([customMint.mint])
      .then((infos) => {
        if (cancelled) return
        const info = infos[customMint.mint]
        setCustomDecimals(info ? info.decimals : null)
      })
      .catch(() => !cancelled && setCustomDecimals(null))
    return () => {
      cancelled = true
    }
  }, [customMint])

  // Sell-side balance, for the 25/50/75/Max row — same Token-2022-safe ATA
  // derivation the web app's SwapPanel and swapExecutor.ts already use.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!selectedAccount || inputDecimals == null) {
        if (!cancelled) setInputBalance(null)
        return
      }
      try {
        const mintPk = new PublicKey(inputMint)
        if (mintPk.equals(NATIVE_MINT)) {
          const lamports = await connection.getBalance(selectedAccount.publicKey)
          if (!cancelled) setInputBalance(lamports / 1e9)
        } else {
          const tokenProgramId = await getTokenProgramId(connection, mintPk)
          const ata = getAssociatedTokenAddressSync(
            mintPk,
            selectedAccount.publicKey,
            false,
            tokenProgramId,
          )
          const bal = await connection.getTokenAccountBalance(ata)
          if (!cancelled) setInputBalance(bal.value.uiAmount ?? 0)
        }
      } catch {
        if (!cancelled) setInputBalance(0)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [connection, selectedAccount, inputMint, inputDecimals])

  const rawAmount = toRawUnits(amount, inputDecimals ?? 0)
  const canQuote =
    inputMint !== outputMint &&
    Number(amount) > 0 &&
    inputDecimals != null &&
    (!buyIsCustom || outputDecimals != null)

  const runQuote = useCallback(async () => {
    if (!canQuote) return
    setQuoting(true)
    setQuoteErr(null)
    try {
      const q = await quote(inputMint, outputMint, rawAmount)
      setQuoteResp(q)
    } catch (e) {
      setQuoteResp(null)
      setQuoteErr(friendlyErrorMessage(e))
    } finally {
      setQuoting(false)
    }
  }, [canQuote, quote, inputMint, outputMint, rawAmount])

  // Debounced auto-quote on any input change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!canQuote) {
      setQuoteResp(null)
      return
    }
    debounceRef.current = setTimeout(runQuote, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMint, outputMint, rawAmount, outputDecimals])

  const routeLabels = useMemo(() => {
    if (!quoteResp?.routePlan) return ''
    return (quoteResp.routePlan as any[])
      .map((r) => r?.swapInfo?.label)
      .filter(Boolean)
      .join(' → ')
  }, [quoteResp])

  // Keypad -> amount string. Collapses a leading "0" (unless typing "0.").
  const onKeyPress = useCallback((key: string) => {
    setAmount((prev) => {
      if (key === '⌫') return prev.length <= 1 ? '0' : prev.slice(0, -1)
      if (key === '.') return prev.includes('.') ? prev : prev + '.'
      if (prev === '0') return key
      return prev + key
    })
  }, [])

  const onPercent = useCallback(
    (pct: number) => {
      if (inputBalance == null) return
      const isSol = inputMint === PRESETS.SOL.mint
      const usable = isSol ? Math.max(0, inputBalance - SOL_FEE_RESERVE) : inputBalance
      const value = usable * pct
      setAmount(value > 0 ? value.toFixed(Math.min(6, inputDecimals ?? 6)) : '0')
    },
    [inputBalance, inputMint, inputDecimals],
  )

  const onFlip = useCallback(() => {
    setSellKey(buyKey)
    setBuyKey(sellKey)
    if (customMint) {
      setCustomMint({ side: customMint.side === 'sell' ? 'buy' : 'sell', mint: customMint.mint })
    }
    setAmount('0')
    setQuoteResp(null)
  }, [sellKey, buyKey, customMint])

  const sellOptions: TokenOption[] = PRESET_KEYS.map((k) => ({
    key: k,
    symbol: k,
    icon: icons[PRESETS[k].mint],
    mint: PRESETS[k].mint,
  }))
  const buyOptions = sellOptions

  const onSwap = useCallback(async () => {
    if (!quoteResp || outputDecimals == null) return
    // Snapshot the tokens/amount involved BEFORE the swap resets them, so the
    // result overlay shows what was actually swapped either way.
    const inToken: TokenOption = {
      key: sellKey,
      symbol: sellSymbol,
      icon: icons[inputMint],
      mint: inputMint,
    }
    const outToken: TokenOption = {
      key: buyKey,
      symbol: buySymbol,
      icon: icons[outputMint],
      mint: outputMint,
    }
    setSwapping(true)
    try {
      const referrerArg = await resolvePendingReferrer(connection)
      const r = await swap({ inputMint, outputMint, amount: rawAmount, outputDecimals, referrerArg })
      setOverlay({
        outcome: 'success',
        inAmount: fromRawUnits(rawAmount, inputDecimals ?? 0),
        inToken,
        outAmount: fromRawUnits(r.outAmount, outputDecimals),
        outToken,
        recordedForRank: r.recordedForRank,
        guildFounderAmount: r.guildFounderAmount
          ? fromRawUnits(r.guildFounderAmount, outputDecimals)
          : null,
        guildTokenMint: r.guildTokenMint,
        // Placeholder until the resolve-guild-symbol effect below patches in
        // the House's real symbol/icon (mirrors the web app's own
        // getTokenInfoBatched(guildTokenMint) call for this exact line).
        guildToken: r.guildTokenMint
          ? { key: 'guild', symbol: shortAddr(r.guildTokenMint), mint: r.guildTokenMint }
          : null,
        sig: r.sig,
      })
      setAmount('0')
    } catch (e) {
      setOverlay({
        outcome: wasCancelled(e) ? 'cancelled' : 'failed',
        errorMessage: friendlyErrorMessage(e),
      })
    } finally {
      setSwapping(false)
    }
  }, [
    quoteResp,
    swap,
    connection,
    inputMint,
    outputMint,
    rawAmount,
    outputDecimals,
    inputDecimals,
    sellKey,
    sellSymbol,
    buyKey,
    buySymbol,
    icons,
  ])

  // Which House got paid, for the result overlay's "went to the X token
  // founder" line — resolved once a swap actually lands with a guild
  // founder amount, same as the web app's own getTokenInfoBatched call.
  useEffect(() => {
    const mint = overlay?.guildTokenMint
    if (!mint) return
    let cancelled = false
    getTokenInfos([mint]).then((infos) => {
      const info = infos[mint]
      if (!cancelled && info) {
        setOverlay((prev) =>
          prev
            ? { ...prev, guildToken: { key: mint, symbol: info.symbol, icon: info.icon, mint } }
            : prev,
        )
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.guildTokenMint])

  const buyDisplay = quoteResp && outputDecimals != null ? fromRawUnits(quoteResp.outAmount, outputDecimals) : '0'

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.panel}>
          <Text variant="labelLarge" style={styles.panelLabel}>
            SELL
          </Text>
          <View style={styles.amountRow}>
            <Text variant="displaySmall" numberOfLines={1} style={styles.amountText}>
              {amount}
            </Text>
            <TokenPill
              selected={{ key: sellKey, symbol: sellSymbol, icon: icons[inputMint], mint: inputMint }}
              options={sellOptions}
              onSelect={(k) => {
                setSellKey(k)
                if (sellIsCustom) setCustomMint(null)
              }}
              onCustom={() => setCustomMint({ side: 'sell', mint: '' })}
            />
          </View>
          {sellIsCustom ? (
            <TextInput
              mode="outlined"
              dense
              placeholder="Paste a mint address (Token-2022 ok)"
              autoCapitalize="none"
              autoCorrect={false}
              value={customMint!.mint}
              onChangeText={(v) => setCustomMint({ side: 'sell', mint: v })}
              style={styles.mintInput}
            />
          ) : null}
          <View style={styles.subRow}>
            <Text variant="bodySmall" style={styles.dim}>
              {quoting ? 'Fetching quote…' : ' '}
            </Text>
            <Text variant="bodySmall" style={styles.dim}>
              Balance: {inputBalance != null ? inputBalance.toFixed(4) : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.flipRow}>
          <TouchableRipple style={styles.flipButton} onPress={onFlip} borderless>
            <FontAwesome6 name="up-down" size={14} color={C.textPrimary} />
          </TouchableRipple>
        </View>

        <View style={styles.panel}>
          <Text variant="labelLarge" style={styles.panelLabel}>
            BUY
          </Text>
          <View style={styles.amountRow}>
            <Text variant="displaySmall" numberOfLines={1} style={styles.amountTextDim}>
              {buyDisplay}
            </Text>
            <TokenPill
              selected={{ key: buyKey, symbol: buySymbol, icon: icons[outputMint], mint: outputMint }}
              options={buyOptions}
              onSelect={(k) => {
                setBuyKey(k)
                if (buyIsCustom) setCustomMint(null)
              }}
              onCustom={() => setCustomMint({ side: 'buy', mint: '' })}
            />
          </View>
          {buyIsCustom ? (
            <TextInput
              mode="outlined"
              dense
              placeholder="Paste a mint address (Token-2022 ok)"
              autoCapitalize="none"
              autoCorrect={false}
              value={customMint!.mint}
              onChangeText={(v) => setCustomMint({ side: 'buy', mint: v })}
              style={styles.mintInput}
            />
          ) : null}
          <View style={styles.subRow}>
            <Text variant="bodySmall" style={styles.dim}>
              {quoteResp
                ? `Price impact ${(Number(quoteResp.priceImpactPct) * 100).toFixed(3)}%${routeLabels ? ` · ${routeLabels}` : ''}`
                : ' '}
            </Text>
          </View>
        </View>

        {quoteErr ? (
          <HelperText type="error" visible>
            {quoteErr}
          </HelperText>
        ) : null}

        <View style={styles.percentRow}>
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <TouchableRipple
              key={p}
              style={styles.percentButton}
              onPress={() => onPercent(p)}
              disabled={inputBalance == null}
            >
              <Text style={styles.percentText}>{p === 1 ? 'Max' : `${p * 100}%`}</Text>
            </TouchableRipple>
          ))}
        </View>

        <Keypad onKeyPress={onKeyPress} />

        {selectedAccount ? (
          <Button
            mode="contained"
            onPress={onSwap}
            disabled={!quoteResp || swapping || outputDecimals == null}
            loading={swapping}
            style={styles.action}
            contentStyle={styles.actionContent}
          >
            {swapping ? 'Swapping…' : 'Swap'}
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={() => connect()}
            style={styles.action}
            contentStyle={styles.actionContent}
          >
            Connect wallet
          </Button>
        )}

      </ScrollView>

      {overlay ? <SwapResultOverlay {...overlay} onClose={() => setOverlay(null)} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  container: { padding: 20, paddingBottom: 24 },
  panel: {
    backgroundColor: C.bgElevated,
    borderRadius: 20,
    padding: 16,
  },
  panelLabel: { color: C.textSecondary, letterSpacing: 1 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  amountText: { color: C.textPrimary, fontWeight: '600', flexShrink: 1 },
  amountTextDim: { color: C.textSecondary, fontWeight: '600', flexShrink: 1 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  dim: { color: C.textSecondary },
  mintInput: { marginTop: 8, backgroundColor: 'transparent' },
  flipRow: { alignItems: 'center', marginVertical: -14, zIndex: 1 },
  flipButton: {
    backgroundColor: C.bgHover,
    borderWidth: 3,
    borderColor: C.bg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 8 },
  percentButton: {
    flex: 1,
    backgroundColor: C.bgElevated,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  percentText: { color: C.textPrimary, fontWeight: '600' },
  action: { marginTop: 16, borderRadius: 16 },
  actionContent: { paddingVertical: 6 },
})
