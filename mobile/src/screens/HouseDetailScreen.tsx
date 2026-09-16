import React, { useLayoutEffect, useMemo } from 'react'
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { Button, Text, TouchableRipple } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import type { RootStackParamList } from '../navigators/AppNavigator'
import { useGuildMembership } from '../swapkings/useGuildMembership'
import { useGuildFeeHistory } from '../swapkings/guildFeeHistory'
import { GUILD_MARKET_CAP_FLOOR_USD } from '../swapkings/pumpfun'
import { formatUsdCompact, shortAddr, solscanTxUrl } from '../swapkings/format'
import { dexscreenerBannerUrl } from '../swapkings/jupiterInfo'
import { TokenIcon } from '../components/TokenPill'
import { BannerImage } from '../components/BannerImage'
import { SWAPKINGS_COLORS as C } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'HouseDetail'>

export function HouseDetailScreen({ route, navigation }: Props) {
  const { tokenMint } = route.params
  const {
    guilds,
    selectedAccount,
    currentFounder,
    inAGuild,
    onJoin,
    onLeave,
    busyMint,
    err,
  } = useGuildMembership()

  const row = guilds.find((g) => g.tokenMint === tokenMint) ?? null

  // Icon + symbol replaces the plain text title next to the back arrow —
  // the icon+name row that used to repeat right below the banner was
  // redundant with this and has been dropped (user feedback, 2026-09-15).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <TokenIcon option={{ key: tokenMint, symbol: row?.symbol || 'H', mint: tokenMint }} size={22} />
          <Text variant="titleMedium" style={styles.headerTitleText}>
            {row?.symbol || shortAddr(tokenMint)}
          </Text>
        </View>
      ),
    })
  }, [navigation, row?.symbol, tokenMint])

  // Always relevant once a mint is open — the hook's own param only gates
  // "is there any founder wallet in the whole app worth asking the cache
  // for", which is trivially true here.
  const { rows: allFeeRows, loading: feesLoading } = useGuildFeeHistory(1)
  const feeRows = useMemo(
    () => (row ? allFeeRows.filter((r) => r.founderWallet === row.founderWallet) : []),
    [allFeeRows, row],
  )

  if (!row) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  const isCurrent = row.founderWallet === currentFounder
  const busy = busyMint === row.tokenMint
  const belowFloor = row.marketCapUsd !== undefined && row.marketCapUsd < GUILD_MARKET_CAP_FLOOR_USD

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BannerImage mint={row.tokenMint} url={dexscreenerBannerUrl(row.tokenMint)} height={160} />

      <View style={styles.body}>
        {isCurrent ? (
          <Button
            mode="contained"
            buttonColor="#ffffff"
            textColor="#000000"
            style={styles.bigButton}
            contentStyle={styles.bigButtonContent}
            loading={busy}
            disabled={busy || !selectedAccount}
            onPress={() => onLeave(row)}
            icon={({ size, color }) => (
              <FontAwesome6 name="right-from-bracket" size={size * 0.85} color={color} />
            )}
          >
            Leave
          </Button>
        ) : (
          <Button
            mode="contained"
            buttonColor="#ffffff"
            textColor="#000000"
            style={styles.bigButton}
            contentStyle={styles.bigButtonContent}
            loading={busy}
            disabled={busy || belowFloor || !selectedAccount}
            onPress={() => onJoin(row)}
            icon={({ size, color }) => (
              <FontAwesome6 name={inAGuild ? 'arrows-rotate' : 'door-open'} size={size * 0.85} color={color} />
            )}
          >
            {inAGuild ? 'Switch to this House' : 'Join House'}
          </Button>
        )}

        <View style={styles.statsCard}>
          <View style={styles.statBlock}>
            <FontAwesome6 name="users" size={14} color={C.textSecondary} />
            <Text style={styles.statValue}>{row.memberCount}</Text>
          </View>
          <View style={styles.statBlock}>
            <FontAwesome6 name="briefcase" size={14} color={C.textSecondary} />
            <Text style={styles.statValue}>
              {row.marketCapUsd !== undefined ? formatUsdCompact(row.marketCapUsd) : '—'}
            </Text>
            <Text style={styles.statLabel}>Market Cap</Text>
          </View>
          <View style={styles.statBlock}>
            <FontAwesome6 name="hand-holding-dollar" size={14} color={C.textSecondary} />
            <Text style={styles.statValue}>{formatUsdCompact(row.totalFeesEarnedUsd)}</Text>
            <Text style={styles.statLabel}>Fees earned</Text>
          </View>
        </View>

        {err ? <Text style={styles.errorText}>{err}</Text> : null}

        <Text variant="titleLarge" style={styles.sectionTitle}>
          Recent fees
        </Text>
        {feesLoading && feeRows.length === 0 ? (
          <ActivityIndicator style={styles.loading} />
        ) : feeRows.length === 0 ? (
          <Text style={styles.dim}>No house-fee transactions yet.</Text>
        ) : (
          feeRows.map((r) => (
            <TouchableRipple
              key={r.signature}
              style={styles.feeRow}
              onPress={() => Linking.openURL(solscanTxUrl(r.signature))}
            >
              <>
                <View style={styles.feeTxRow}>
                  <Text variant="bodySmall" style={styles.feeTx}>
                    {shortAddr(r.signature)}
                  </Text>
                  <FontAwesome6 name="arrow-up-right-from-square" size={10} color={C.textSecondary} />
                </View>
                <View style={styles.feeAmountRow}>
                  <TokenIcon option={{ key: r.mint, symbol: 'T', mint: r.mint }} size={14} />
                  <Text style={styles.feeAmount}>{formatUsdCompact(r.usdAmount)}</Text>
                </View>
              </>
            </TouchableRipple>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 32 },
  body: { padding: 20 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitleText: { color: C.textPrimary },
  bigButton: { borderRadius: 16, marginTop: 4, marginBottom: 20 },
  bigButtonContent: { height: 48 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: C.bgElevated,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: C.textPrimary, fontWeight: '700', fontSize: 15 },
  statLabel: { color: C.textSecondary, fontSize: 11 },
  errorText: { color: C.negative, marginBottom: 12 },
  sectionTitle: { color: C.textPrimary, fontWeight: '700', marginBottom: 20 },
  loading: { marginTop: 16 },
  dim: { color: C.textSecondary, opacity: 0.7 },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bgElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  feeTxRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeTx: { color: C.textSecondary },
  feeAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeAmount: { color: C.positive, fontWeight: '700' },
})
