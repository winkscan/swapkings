import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import { LinearGradient } from 'expo-linear-gradient'

import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useRank } from '../swapkings/useRank'
import { SWAPKINGS_COLORS as C } from '../theme'

// Same content/copy as the web app's own RankCard.tsx + TierInfoModal.tsx
// (user sent a screenshot of both, asked for a 1:1 match) — the tier table
// used to open as a popup on tapping the (i) button; now it's just always
// shown inline below the rank card instead (user's own follow-up request).
const TIER_INFO = [
  { emoji: '🔰', name: 'Initiate', range: '$0 – $5K', discount: '0%' },
  { emoji: '⚔️', name: 'Adept', range: '$5K – $50K', discount: '12.5%' },
  { emoji: '🛡️', name: 'Veteran', range: '$50K – $500K', discount: '25%' },
  { emoji: '🏰', name: 'Lord', range: '$500K – $5M', discount: '37.5%' },
  { emoji: '👑', name: 'King', range: '$5M+', discount: '50%' },
]

export function RankScreen() {
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const { volumeUsd, tier, nextTier, discountBps } = useRank()

  if (!selectedAccount) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.mb}>
          Connect your wallet to see your LUCK tier
        </Text>
        <Button
          mode="contained"
          onPress={() => connect()}
          style={styles.connectBtn}
          icon={({ size, color }) => <FontAwesome6 name="wallet" size={size * 0.85} color={color} />}
        >
          Connect wallet
        </Button>
      </View>
    )
  }

  // Progress toward the wallet's actual NEXT tier, same $ breakpoints as the
  // tier table below — King has no further tier, so its bar just shows full.
  const stageStart = tier.minVolumeUsd
  const stageEnd = nextTier ? nextTier.minVolumeUsd : tier.minVolumeUsd
  const stageProgressPct = nextTier
    ? Math.min(100, ((volumeUsd - stageStart) / (stageEnd - stageStart)) * 100)
    : 100

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View>
            <View style={styles.tierNameRow}>
              <Text style={styles.emoji}>{tier.emoji}</Text>
              <Text variant="titleLarge" style={styles.tierName}>
                {tier.name}
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.dim}>
              {discountBps / 100}% fee discount
            </Text>
          </View>

          <View style={styles.volumeBlock}>
            <Text variant="titleLarge" style={styles.volumeValue}>
              ${volumeUsd.toFixed(2)}
            </Text>
            <Text variant="bodySmall" style={styles.dim}>
              Lifetime swap volume
            </Text>
          </View>
        </View>

        <View style={styles.barTrack}>
          <LinearGradient
            colors={['#F5C518', C.positive]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${stageProgressPct}%` }]}
          />
        </View>
        <View style={styles.barLabels}>
          <Text variant="bodySmall" style={styles.dim}>
            ${volumeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text variant="bodySmall" style={styles.dim}>
            ${stageEnd.toLocaleString('en-US')}
          </Text>
        </View>
      </View>

      <View style={[styles.card, styles.tiersCard]}>
        <Text variant="titleLarge" style={styles.tiersTitle}>
          Rank tiers
        </Text>
        <Text variant="bodySmall" style={styles.tiersSubtitle}>
          Based on your lifetime swap volume — a guaranteed discount on the platform fee, no
          chance involved.
        </Text>

        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.tierCol]}>TIER</Text>
          <Text style={[styles.headerCell, styles.volumeCol]}>VOLUME</Text>
          <Text style={[styles.headerCell, styles.discountCol]}>FEE DISCOUNT</Text>
        </View>

        {TIER_INFO.map((t, i) => (
          <View key={t.name} style={[styles.row, i === TIER_INFO.length - 1 && styles.rowLast]}>
            <Text style={[styles.tierCell, styles.tierCol]}>
              {t.emoji} {t.name}
            </Text>
            <Text style={[styles.volumeCell, styles.volumeCol]}>{t.range}</Text>
            <Text style={[styles.discountCell, styles.discountCol]}>{t.discount}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mb: { marginBottom: 16, textAlign: 'center' },
  connectBtn: { borderRadius: 16 },
  card: { backgroundColor: C.bgElevated, borderRadius: 20, padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tierNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 20 },
  tierName: { color: C.textPrimary, fontWeight: '700' },
  dim: { color: C.textSecondary, marginTop: 4 },
  volumeBlock: { alignItems: 'flex-end' },
  volumeValue: { color: C.positive, fontWeight: '700' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.bgInput,
    overflow: 'hidden',
    marginTop: 16,
  },
  barFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tiersCard: { marginTop: 20 },
  tiersTitle: { color: C.textPrimary, fontWeight: '700' },
  tiersSubtitle: { color: C.textSecondary, marginTop: 4, marginBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    paddingBottom: 8,
  },
  headerCell: { color: C.textSecondary, fontSize: 11, letterSpacing: 0.5, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowLast: { borderBottomWidth: 0 },
  tierCol: { flex: 1.2 },
  volumeCol: { flex: 1.1 },
  discountCol: { flex: 0.9, textAlign: 'right' },
  tierCell: { color: C.textPrimary, fontWeight: '600' },
  volumeCell: { color: C.textSecondary },
  discountCell: { color: C.positive, fontWeight: '700', textAlign: 'right' },
})
