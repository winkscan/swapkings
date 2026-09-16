import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Button,
  HelperText,
  Modal,
  Portal,
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
import { SWAPKINGS_COLORS as C } from '../theme'

// Client-side-only extra rows a wallet pasted in via the Add House modal
// (see AddTokenForm on web) — mirrors app/src/pages/GuildsPage.tsx's own
// localStorage-backed MANUAL_ROWS_KEY, just AsyncStorage instead.
const MANUAL_ROWS_KEY = 'swapkings.manualGuildRows.v1'

export function HousesScreen() {
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

  const [addVisible, setAddVisible] = useState(false)

  const renderRow = useCallback(
    ({ item }: { item: GuildRow }) => <HouseCard row={item} onPress={() => goToHouse(item.tokenMint)} />,
    [goToHouse],
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
      {/* Outside the FlatList (unlike the old tab bar it replaces) so it stays
          pinned above the scrolling list, the same way the screen's own
          header does (user feedback, 2026-09-16). */}
      <View style={styles.stickyHeader}>
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
          right={
            search ? (
              <TextInput.Icon
                icon={() => <FontAwesome6 name="xmark" size={14} color={C.textSecondary} />}
                onPress={() => setSearch('')}
              />
            ) : undefined
          }
        />
        <Button
          mode="contained"
          buttonColor={C.bgHover}
          textColor={C.textPrimary}
          style={styles.addBtn}
          contentStyle={styles.addBtnContent}
          icon={({ size, color }) => <FontAwesome6 name="plus" size={size * 0.8} color={color} />}
          onPress={() => setAddVisible(true)}
        >
          Add House
        </Button>
      </View>

      {err ? (
        <HelperText type="error" visible style={styles.err}>
          {err}
        </HelperText>
      ) : null}

      <FlatList
        data={filteredGuilds}
        keyExtractor={(g) => g.tokenMint}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          currentRow ? (
            <TouchableRipple onPress={() => goToHouse(currentRow.tokenMint)} style={styles.highlightTouch}>
              <CurrentHouseHighlight row={currentRow} />
            </TouchableRipple>
          ) : null
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

      <Portal>
        <Modal
          visible={addVisible}
          onDismiss={() => setAddVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <AddHouseForm
            guilds={guilds}
            onAdd={(row) => {
              addManualRow(row)
              setAddVisible(false)
            }}
          />
        </Modal>
      </Portal>
    </View>
  )
}

// Your active House — full-width banner + all the same info the web app's
// own CurrentGuildHighlight (GuildsPage.tsx) shows (token badge, crown +
// "Your house", fees earned + member count) — no Leave button any more,
// that action now lives only inside the House detail screen (tapping
// anywhere on this card opens it, see the TouchableRipple at the call site).
// White card — the one visual exception to every other House now sharing
// HouseCard's dark-grey look (user follow-up, 2026-09-16).
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
          <Text style={styles.highlightFee}>{formatUsdCompact(row.totalFeesEarnedUsd)}</Text>
        </View>
        <View style={styles.highlightBottomRow}>
          <View style={styles.highlightHouseRow}>
            <FontAwesome6 name="crown" size={11} color="#000000" />
            <Text style={styles.highlightHouseText}>Your house</Text>
          </View>
          <View style={styles.statsInline}>
            <FontAwesome6 name="users" size={11} color={C.textSecondary} />
            <Text style={styles.highlightMembers}>
              {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// Every other House in the list — same banner-card shape as
// CurrentHouseHighlight, dark-grey instead of white, and Market Cap in
// place of the crown + "Your house" line (this isn't your house, so that
// line wouldn't make sense here). Tapping anywhere opens the House detail
// screen; there's no button on the card itself any more.
function HouseCard({ row, onPress }: { row: GuildRow; onPress: () => void }) {
  return (
    <TouchableRipple onPress={onPress} style={styles.houseCardTouch}>
      <View style={styles.houseCard}>
        <BannerImage mint={row.tokenMint} url={dexscreenerBannerUrl(row.tokenMint)} height={110} />
        <View style={styles.highlightBody}>
          <View style={styles.highlightTopRow}>
            <View style={styles.houseCardBadge}>
              <TokenIcon
                option={{ key: row.tokenMint, symbol: row.symbol || 'H', mint: row.tokenMint }}
                size={18}
              />
              <Text style={styles.houseCardSymbol}>{row.symbol || shortAddr(row.tokenMint)}</Text>
            </View>
            <Text style={styles.houseCardFee}>{formatUsdCompact(row.totalFeesEarnedUsd)}</Text>
          </View>
          <View style={styles.highlightBottomRow}>
            <View style={styles.statsInline}>
              <FontAwesome6 name="briefcase" size={11} color={C.textSecondary} />
              <Text style={styles.houseCardSubText}>
                {row.marketCapUsd !== undefined ? formatUsdCompact(row.marketCapUsd) : '—'}
              </Text>
            </View>
            <View style={styles.statsInline}>
              <FontAwesome6 name="users" size={11} color={C.textSecondary} />
              <Text style={styles.houseCardSubText}>
                {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableRipple>
  )
}

// Escape hatch for a token the discovery list doesn't cover — same as
// AddTokenForm on web, now inside the "+ Add House" popup instead of its
// own tab.
function AddHouseForm({ guilds, onAdd }: { guilds: GuildRow[]; onAdd: (row: GuildRow) => void }) {
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
    <View>
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
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mb: { marginBottom: 16, textAlign: 'center' },
  stickyHeader: { flexDirection: 'row', alignItems: 'center', gap: 20, margin: 20, marginBottom: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  dim: { opacity: 0.7 },
  err: { marginHorizontal: 20 },
  loading: { textAlign: 'center', marginTop: 32, opacity: 0.7 },
  errorText: { color: C.negative },
  statsInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  highlightTouch: { borderRadius: 20, marginBottom: 20, overflow: 'hidden' },
  highlight: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  highlightBody: { padding: 14, gap: 6 },
  highlightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  highlightSymbol: { color: '#fff', fontWeight: '700' },
  highlightFee: { color: '#000000', fontWeight: '700', fontSize: 22 },
  highlightBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  highlightHouseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  highlightHouseText: { color: '#000000', fontSize: 12, fontWeight: '600' },
  highlightMembers: { color: C.textSecondary, fontSize: 12 },

  houseCardTouch: { borderRadius: 20, marginBottom: 20, overflow: 'hidden' },
  houseCard: { backgroundColor: C.bgElevated },
  houseCardBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  houseCardSymbol: { color: C.textPrimary, fontWeight: '700', fontSize: 16 },
  houseCardFee: { color: C.positive, fontWeight: '700', fontSize: 16 },
  houseCardSubText: { color: C.textSecondary, fontSize: 12 },

  searchInput: { flex: 1, height: 40, backgroundColor: 'transparent' },
  searchOutline: { borderRadius: 16 },
  addBtn: { borderRadius: 16 },
  addBtnContent: { height: 40 },

  modalContainer: {
    backgroundColor: C.bgElevated,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
  },
  addTitle: { color: C.textPrimary, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addInput: { flex: 1, backgroundColor: 'transparent' },
  addHelper: { color: C.textSecondary, marginTop: 10 },
})
