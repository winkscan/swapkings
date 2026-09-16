import React from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import { TokenIcon, type TokenOption } from './TokenPill'
import { SWAPKINGS_COLORS as C } from '../theme'
import { shortAddr, solscanTxUrl } from '../swapkings/format'

export type SwapOutcome = 'success' | 'failed' | 'cancelled'

// Full-screen takeover (not a popup) shown after a swap resolves — same
// content and layout as swapkings.app's own success/failed modal
// (SwapPanel.tsx): status icon, "in → out" amount row with real token
// icons, the House-cut line when a guild founder got paid, the tx
// signature, and a plain gray Close button pinned near the bottom.
export function SwapResultOverlay({
  outcome,
  onClose,
  inAmount,
  inToken,
  outAmount,
  outToken,
  recordedForRank,
  guildFounderAmount,
  guildToken,
  sig,
  errorMessage,
}: {
  outcome: SwapOutcome
  onClose: () => void
  inAmount?: string
  inToken?: TokenOption
  outAmount?: string
  outToken?: TokenOption
  recordedForRank?: boolean
  guildFounderAmount?: string | null
  guildToken?: TokenOption | null
  sig?: string
  errorMessage?: string
}) {
  const isSuccess = outcome === 'success'
  const title = isSuccess ? 'Success' : outcome === 'cancelled' ? 'Cancelled' : 'Failed'

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={[styles.statusCircle, { backgroundColor: isSuccess ? C.positive : C.negative }]}>
          <FontAwesome6
            name={isSuccess ? 'check' : 'xmark'}
            size={32}
            color={C.accentTextOn}
          />
        </View>
        <Text variant="headlineSmall" style={styles.title}>
          {title}
        </Text>

        {isSuccess && inToken && outToken ? (
          <View style={styles.amountRow}>
            <Text variant="bodyLarge" style={styles.amountText}>
              {inAmount}
            </Text>
            <TokenBadge token={inToken} />
            <FontAwesome6 name="arrow-right" size={12} color={C.textSecondary} />
            <Text variant="bodyLarge" style={styles.amountText}>
              {outAmount}
            </Text>
            <TokenBadge token={outToken} />
          </View>
        ) : null}

        {isSuccess && !recordedForRank ? (
          <Text variant="bodySmall" style={styles.dim}>
            Below the minimum fee — didn't count toward LUCK this time.
          </Text>
        ) : null}

        {isSuccess && guildFounderAmount && guildToken ? (
          <View style={styles.guildRow}>
            <TokenIcon option={outToken!} size={14} />
            <Text style={styles.guildAmount}>{guildFounderAmount}</Text>
            <Text style={styles.dim}>went to the</Text>
            <FontAwesome6 name="people-group" size={12} color={C.textSecondary} />
            <Text style={styles.guildAmount}>{guildToken.symbol}</Text>
            <Text style={styles.dim}>token founder</Text>
          </View>
        ) : null}

        {!isSuccess && errorMessage && outcome !== 'cancelled' ? (
          <Text variant="bodySmall" style={[styles.dim, styles.errorText]}>
            {errorMessage}
          </Text>
        ) : null}

        {isSuccess && sig ? (
          <Text
            variant="bodySmall"
            style={styles.sig}
            onPress={() => Linking.openURL(solscanTxUrl(sig))}
          >
            {shortAddr(sig)}
          </Text>
        ) : null}
      </View>

      <Button mode="contained" buttonColor={C.bgHover} textColor={C.textPrimary} onPress={onClose} style={styles.close}>
        Close
      </Button>
    </View>
  )
}

function TokenBadge({ token }: { token: TokenOption }) {
  return (
    <View style={styles.badge}>
      <TokenIcon option={token} size={18} />
      <Text style={styles.badgeText}>{token.symbol}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: { alignItems: 'center', paddingTop: 64 },
  statusCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.textPrimary, fontWeight: '700', marginTop: 16 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  amountText: { color: C.textPrimary, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.bgElevated,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeText: { color: C.textPrimary, fontWeight: '700' },
  dim: { color: C.textSecondary, marginTop: 4 },
  errorText: { textAlign: 'center', paddingHorizontal: 12 },
  guildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  guildAmount: { color: C.textPrimary, fontWeight: '600' },
  sig: { color: C.textSecondary, marginTop: 20 },
  close: { borderRadius: 16 },
})
