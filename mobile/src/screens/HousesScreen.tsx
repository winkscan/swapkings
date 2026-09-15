import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import { PublicKey } from '@solana/web3.js'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { RootStackParamList } from '../navigators/AppNavigator'
import { useMobileWallet } from '../utils/useMobileWallet'
import { type GuildRow } from '../swapkings/useGuilds'
import { useGuildMembership } from '../swapkings/useGuildMembership'
import { GUILD_MARKET_CAP_FLOOR_USD, getPumpFunTokenInfo } from '../swapkings/pumpfun'
import { dexscreenerBannerUrl } from '../swapkings/jupiterInfo'
import { formatUsdCompact, shortAddr } from '../swapkings/format'
import { TokenIcon } from '../components/TokenPill'
import { BannerImage } from '../components/BannerImage'
import { PillTabs } from '../components/PillTabs'
import { Fade } from '../components/Fade'
import { SWAPKINGS_COLORS as C } from '../theme'

// Client-side-only extra rows a wallet pasted in via the Add House tab (see
// AddTokenForm on web) — mirrors app/src/pages/GuildsPage.tsx's own
// localStorage-backed MANUAL_ROWS_KEY, just AsyncStorage instead.
const MANUAL_ROWS_KEY = 'swapkings.manualGuildRows.v1'

const TOP_HOUSES_COUNT = 3

type Tab = 'houses' | 'add'

export function HousesScreen() {
  const [tab, setTab] = useState<Tab>('houses')
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { connect } = useMobileWallet()
  const { guilds: discoveredGuilds, loading, refresh, selectedAccount, currentFounder, currentRow, err } =
    useGuildMembership()

  const goToHouse = useCallback(
    (tokenMint: string) => {
      navigation.navigate('HouseDetail', { tokenMint })
    },
    [navigation],
  )

  const [manualRows, setManualRows] = useState<GuildRow[]>([])
  useEffect(() => {
    AsyncStorage.getItem(MANUAL_ROWS_KEY)
      .then((raw) => raw && setManualRows(JSON.parse(raw)))
      .catch(() => {})
  }, [])
  const addManualRow = useCallback((row: GuildRow) => {
    setManualRows((prev) => {
      const next = [...prev, row]
      AsyncStorage.setItem(MANUAL_ROWS_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  // Discovered (Jupiter ranking + on-chain Guild accounts) merged with
  // manually-pasted rows not already covered.
  const guilds = useMemo(() => {
    const known = new Set(discoveredGuilds.map((g) => g.tokenMint))
    return [...discoveredGuilds, ...manualRows.filter((m) => !known.has(m.tokenMint))]
  }, [discoveredGuilds, manualRows])

  const [search, setSearch] = useState('')
  const filteredGuilds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guilds
    return guilds.filter(
      (g) => g.symbol.toLowerCase().includes(q) || g.tokenMint.toLowerCase().includes(q),
    )
  }, [guilds, search])

  const topHouses = useMemo(
    () => [...guilds].sort((a, b) => b.totalFeesEarnedUsd - a.totalFeesEarnedUsd).slice(0, TOP_HOUSES_COUNT),
    [guilds],
  )

  const renderRow = useCallback(
    ({ item }: { item: GuildRow }) => {
      const isCurrent = item.founderWallet === currentFounder
      const belowFloor =
        item.marketCapUsd !== undefined && item.marketCapUsd < GUILD_MARKET_CAP_FLOOR_USD
      return (
        <Card style={styles.row} onPress={() => goToHouse(item.tokenMint)}>
          <Card.Content>
            <View style={styles.rowTop}>
              <View style={styles.rowTitle}>
                <TokenIcon
                  option={{ key: item.tokenMint, symbol: item.symbol || 'H', mint: item.tokenMint }}
                  size={22}
                />
                <Text variant="titleMedium" style={styles.flex1}>
                  {item.symbol || shortAddr(item.tokenMint)}
                </Text>
              </View>
              <Button
                compact
                mode="contained"
                buttonColor={isCurrent ? '#ffffff' : C.bgHover}
                textColor={isCurrent ? '#000000' : C.textPrimary}
                contentStyle={styles.btnPadding}
                onPress={() => goToHouse(item.tokenMint)}
              >
                View
              </Button>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsInline}>
                <FontAwesome6 name="dollar-sign" size={11} color={C.textSecondary} />
                <Text variant="bodySmall" style={styles.dim}>
                  {item.marketCapUsd !== undefined ? formatUsdCompact(item.marketCapUsd) : '—'}
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.dim}>
                ·
              </Text>
              <View style={styles.statsInline}>
                <FontAwesome6 name="users" size={11} color={C.textSecondary} />
                <Text variant="bodySmall" style={styles.dim}>
                  {item.memberCount}
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.dim}>
                ·
              </Text>
              <View style={styles.statsInline}>
                <FontAwesome6 name="hand-holding-dollar" size={11} color={C.textSecondary} />
                <Text variant="bodySmall" style={styles.dim}>
                  {formatUsdCompact(item.totalFeesEarnedUsd)}
                </Text>
              </View>
            </View>
            {belowFloor ? (
              <HelperText type="info" visible padding="none">
                Below the {formatUsdCompact(GUILD_MARKET_CAP_FLOOR_USD)} market-cap floor to open a
                House.
              </HelperText>
            ) : null}
          </Card.Content>
        </Card>
      )
    },
    [currentFounder, goToHouse],
  )

  if (!selectedAccount) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.mb}>
          Connect your wallet to join a House
        </Text>
        <Button mode="contained" onPress={() => connect()}>
          Connect wallet
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabsWrap}>
        <PillTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'houses', label: 'Houses' },
            { value: 'add', label: 'Add House' },
          ]}
          fullWidth
        />
      </View>

      {err ? (
        <HelperText type="error" visible style={styles.err}>
          {err}
        </HelperText>
      ) : null}

      <Fade key={tab} style={styles.flex1}>
      {tab === 'houses' ? (
        <FlatList
          data={filteredGuilds}
          keyExtractor={(g) => g.tokenMint}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {currentRow ? (
                <TouchableRipple onPress={() => goToHouse(currentRow.tokenMint)} style={styles.highlightTouch}>
                  <CurrentHouseHighlight row={currentRow} />
                </TouchableRipple>
              ) : null}
              {topHouses.length > 0 ? (
                <View style={styles.topRow}>
                  {topHouses.map((h) => (
                    <TopHouseCard key={h.tokenMint} row={h} onPress={() => goToHouse(h.tokenMint)} />
                  ))}
                </View>
              ) : null}
              <TextInput
                mode="outlined"
                dense
                placeholder="Search your house"
                autoCapitalize="none"
                autoCorrect={false}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                outlineStyle={styles.searchOutline}
                left={
                  <TextInput.Icon
                    icon={() => <FontAwesome6 name="magnifying-glass" size={14} color={C.textSecondary} />}
                  />
                }
              />
            </>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <Text style={styles.loading}>No Houses found right now.</Text>
            )
          }
          onRefresh={refresh}
          refreshing={loading}
        />
      ) : (
        <AddHouseTab guilds={guilds} onAdd={addManualRow} />
      )}
      </Fade>
    </View>
  )
}

// Your active House — full-width banner + all the same info the web app's
// own CurrentGuildHighlight (GuildsPage.tsx) shows (token badge, crown +
// "Your house", fees earned + member count) — no Leave button any more,
// that action now lives only inside the House detail screen (tapping
// anywhere on this card opens it, see the TouchableRipple at the call site).
function CurrentHouseHighlight({ row }: { row: GuildRow }) {
  return (
    <View style={styles.highlight}>
      <BannerImage mint={row.tokenMint} url={dexscreenerBannerUrl(row.tokenMint)} height={110} />
      <View style={styles.highlightBody}>
        <View style={styles.highlightTopRow}>
          <View style={styles.highlightBadge}>
            <TokenIcon
              option={{ key: row.tokenMint, symbol: row.symbol || 'H', mint: row.tokenMint }}
              size={18}
            />
            <Text style={styles.highlightSymbol}>{row.symbol || shortAddr(row.tokenMint)}</Text>
          </View>
          <View style={styles.highlightHouseRow}>
            <FontAwesome6 name="crown" size={11} color={C.accentTextOn} />
            <Text style={styles.highlightHouseText}>Your house</Text>
          </View>
        </View>
        <View style={styles.highlightStatsRow}>
          <View style={styles.statsInline}>
            <FontAwesome6 name="dollar-sign" size={11} color={C.accentTextOn} />
            <Text style={styles.highlightFee}>{formatUsdCompact(row.totalFeesEarnedUsd)}</Text>
          </View>
          <Text style={styles.highlightDot}>·</Text>
          <View style={styles.statsInline}>
            <FontAwesome6 name="users" size={11} color={C.accentTextOn} />
            <Text style={styles.highlightMembers}>
              {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// Top 3 Houses by fees earned — banner image + the same info as a regular
// list row, minus the Join/Switch/Leave button (tapping the card itself
// opens the House, where that action lives now).
function TopHouseCard({ row, onPress }: { row: GuildRow; onPress: () => void }) {
  return (
    <TouchableRipple style={styles.topCard} onPress={onPress}>
      <View>
        <BannerImage mint={row.tokenMint} url={dexscreenerBannerUrl(row.tokenMint)} height={56} />
        <View style={styles.topCardBody}>
          <View style={styles.topCardTitleRow}>
            <TokenIcon
              option={{ key: row.tokenMint, symbol: row.symbol || 'H', mint: row.tokenMint }}
              size={16}
            />
            <Text variant="labelMedium" numberOfLines={1} style={styles.topCardSymbol}>
              {row.symbol || shortAddr(row.tokenMint)}
            </Text>
          </View>
          <View style={styles.statsInline}>
            <FontAwesome6 name="dollar-sign" size={9} color={C.textSecondary} />
            <Text variant="labelSmall" numberOfLines={1} style={styles.dim}>
              {row.marketCapUsd !== undefined ? formatUsdCompact(row.marketCapUsd) : '—'}
            </Text>
          </View>
          <View style={styles.statsInline}>
            <FontAwesome6 name="users" size={9} color={C.textSecondary} />
            <Text variant="labelSmall" style={styles.dim}>
              {row.memberCount}
            </Text>
            <Text variant="labelSmall" style={styles.dim}>
              ·
            </Text>
            <FontAwesome6 name="hand-holding-dollar" size={9} color={C.textSecondary} />
            <Text variant="labelSmall" style={styles.dim}>
              {formatUsdCompact(row.totalFeesEarnedUsd)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableRipple>
  )
}

// Escape hatch for a token the discovery list doesn't cover — same as
// AddTokenForm on web.
function AddHouseTab({ guilds, onAdd }: { guilds: GuildRow[]; onAdd: (row: GuildRow) => void }) {
  const [mint, setMint] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = mint.trim()
  const existing = trimmed
    ? guilds.find(
        (g) =>
          g.tokenMint.toLowerCase() === trimmed.toLowerCase() ||
          g.symbol.toLowerCase() === trimmed.toLowerCase(),
      )
    : undefined

  const handleAdd = async () => {
    if (existing) return
    setError(null)
    let mintPk: PublicKey
    try {
      mintPk = new PublicKey(trimmed)
    } catch {
      setError('Not a valid Solana address.')
      return
    }
    setChecking(true)
    try {
      const info = await getPumpFunTokenInfo(mintPk.toBase58())
      if (!info) {
        setError("Couldn't find this token, or it's not from a qualifying launchpad.")
        return
      }
      onAdd({
        guildPda: '',
        tokenMint: info.mint,
        symbol: info.symbol,
        founderWallet: info.creator,
        memberCount: 0,
        totalFeesEarnedUsd: 0,
        marketCapUsd: info.marketCapUsd,
      })
      setMint('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.addCard}>
        <Text variant="titleMedium" style={styles.addTitle}>
          Don&apos;t see your token?
        </Text>
        <View style={styles.addRow}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Token mint address"
            autoCapitalize="none"
            autoCorrect={false}
            value={mint}
            onChangeText={setMint}
            style={styles.addInput}
          />
          <Button
            mode="contained"
            onPress={handleAdd}
            disabled={checking || !trimmed || !!existing}
            loading={checking}
            icon={({ size, color }) => <FontAwesome6 name="plus" size={size * 0.75} color={color} />}
          >
            {checking ? 'Checking…' : 'Add'}
          </Button>
        </View>
        <Text variant="bodySmall" style={styles.addHelper}>
          Supports tokens from pump.fun, letsbonk.fun, Meteora, Jupiter Studio, and Moonshot, above a{' '}
          {formatUsdCompact(GUILD_MARKET_CAP_FLOOR_USD)} market cap.
        </Text>
        {existing ? (
          <Text variant="bodySmall" style={styles.addHelper}>
            {existing.symbol || shortAddr(existing.tokenMint)} is already in the list.
          </Text>
        ) : null}
        {!existing && error ? (
          <Text variant="bodySmall" style={[styles.addHelper, styles.errorText]}>
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mb: { marginBottom: 16, textAlign: 'center' },
  // +10px extra below the tabs, on top of `list`'s own top padding — felt
  // too tight against the content (user feedback, 2026-09-11).
  tabsWrap: { margin: 12, marginBottom: 10 },
  list: { padding: 12 },
  row: { marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  dim: { opacity: 0.7 },
  err: { marginHorizontal: 12 },
  loading: { textAlign: 'center', marginTop: 32, opacity: 0.7 },
  errorText: { color: C.negative },
  btnPadding: { paddingHorizontal: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statsInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  highlightTouch: { borderRadius: 20, marginBottom: 12, overflow: 'hidden' },
  highlight: {
    backgroundColor: C.accent,
    borderRadius: 20,
    overflow: 'hidden',
  },
  highlightBody: { padding: 14, gap: 8 },
  highlightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  highlightSymbol: { color: '#fff', fontWeight: '700' },
  highlightHouseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  highlightHouseText: { color: C.accentTextOn, fontSize: 12, fontWeight: '600' },
  highlightStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  highlightDot: { color: C.accentTextOn, opacity: 0.7 },
  highlightFee: { color: C.accentTextOn, fontWeight: '700', fontSize: 14 },
  highlightMembers: { color: C.accentTextOn, fontSize: 12 },

  topRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  topCard: {
    flex: 1,
    backgroundColor: C.bgElevated,
    borderRadius: 14,
    overflow: 'hidden',
  },
  topCardBody: { padding: 8, gap: 3 },
  topCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topCardSymbol: { color: C.textPrimary, fontWeight: '700', flexShrink: 1 },

  searchInput: { backgroundColor: 'transparent', marginBottom: 12 },
  searchOutline: { borderRadius: 16 },

  addCard: { backgroundColor: C.bgElevated, borderRadius: 16, padding: 16 },
  addTitle: { color: C.textPrimary, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addInput: { flex: 1, backgroundColor: 'transparent' },
  addHelper: { color: C.textSecondary, marginTop: 10 },
})
