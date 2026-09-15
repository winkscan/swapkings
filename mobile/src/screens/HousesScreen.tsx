import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Linking, ScrollView, StyleSheet, View } from 'react-native'
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

import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useGuilds, type GuildRow } from '../swapkings/useGuilds'
import { useRank } from '../swapkings/useRank'
import { useTxRunner } from '../swapkings/txRunner'
import { useGuildFeeHistory } from '../swapkings/guildFeeHistory'
import { buildJoinGuildIxs, buildLeaveGuildIx } from '../swapkings/guildActions'
import { GUILD_MARKET_CAP_FLOOR_USD, getPumpFunTokenInfo } from '../swapkings/pumpfun'
import { getTokenInfos } from '../swapkings/jupiterInfo'
import { guildPda as deriveGuildPda, ZERO_PUBKEY } from '../swapkings/pdas'
import { formatUsdCompact, shortAddr, solscanTxUrl } from '../swapkings/format'
import { friendlyErrorMessage } from '../swapkings/walletErrors'
import { TokenIcon } from '../components/TokenPill'
import { PillTabs } from '../components/PillTabs'
import { SWAPKINGS_COLORS as C } from '../theme'

// Jupiter's token-search endpoint is a single GET with a comma-joined
// `query` — fine for a handful of mints, untested (and risky to trust) once
// the discovery list runs into the dozens, so icon lookups are chunked
// rather than one giant request.
const ICON_BATCH_SIZE = 30

// Client-side-only extra rows a wallet pasted in via the Add House tab (see
// AddTokenForm on web) — mirrors app/src/pages/GuildsPage.tsx's own
// localStorage-backed MANUAL_ROWS_KEY, just AsyncStorage instead.
const MANUAL_ROWS_KEY = 'swapkings.manualGuildRows.v1'

type Tab = 'houses' | 'fees' | 'add'

export function HousesScreen() {
  const [tab, setTab] = useState<Tab>('houses')
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const runTx = useTxRunner()
  const { guilds: discoveredGuilds, loading, refresh, applyMembershipDelta } = useGuilds()
  const rank = useRank()

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

  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => {
    if (guilds.length === 0) return
    const mints = guilds.map((g) => g.tokenMint)
    let cancelled = false
    for (let i = 0; i < mints.length; i += ICON_BATCH_SIZE) {
      const batch = mints.slice(i, i + ICON_BATCH_SIZE)
      getTokenInfos(batch)
        .then((infos) => {
          if (cancelled) return
          const next: Record<string, string> = {}
          for (const [mint, info] of Object.entries(infos)) if (info.icon) next[mint] = info.icon
          setIcons((prev) => ({ ...prev, ...next }))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guilds.length])

  const [busyMint, setBusyMint] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const currentFounder = rank.stats.currentGuildFounderWallet.equals(ZERO_PUBKEY)
    ? null
    : rank.stats.currentGuildFounderWallet.toBase58()
  const currentRow = useMemo(
    () => guilds.find((g) => g.founderWallet === currentFounder) ?? null,
    [guilds, currentFounder],
  )
  const inAGuild = !rank.stats.currentGuild.equals(ZERO_PUBKEY)

  const onJoin = useCallback(
    async (row: GuildRow) => {
      if (!selectedAccount) return
      setBusyMint(row.tokenMint)
      setErr(null)
      try {
        const switchingFrom = currentRow
        const newGuildPda = row.guildPda || deriveGuildPda(new PublicKey(row.tokenMint)).toBase58()
        const ixs = await buildJoinGuildIxs({
          connection,
          walletPublicKey: selectedAccount.publicKey,
          tokenMint: new PublicKey(row.tokenMint),
          founderWallet: new PublicKey(row.founderWallet),
          previousGuild: inAGuild ? rank.stats.currentGuild : null,
          isNewGuild: row.guildPda === '',
        })
        await runTx(ixs)
        applyMembershipDelta(row.tokenMint, row.founderWallet, 1, newGuildPda)
        if (switchingFrom && switchingFrom.tokenMint !== row.tokenMint) {
          applyMembershipDelta(
            switchingFrom.tokenMint,
            switchingFrom.founderWallet,
            -1,
            switchingFrom.guildPda,
          )
        }
        refresh()
        rank.refresh()
      } catch (e) {
        setErr(friendlyErrorMessage(e))
      } finally {
        setBusyMint(null)
      }
    },
    [selectedAccount, connection, currentRow, inAGuild, rank, runTx, applyMembershipDelta, refresh],
  )

  const onLeave = useCallback(
    async (row: GuildRow) => {
      if (!selectedAccount) return
      setBusyMint(row.tokenMint)
      setErr(null)
      try {
        const guild = row.guildPda
          ? new PublicKey(row.guildPda)
          : deriveGuildPda(new PublicKey(row.tokenMint))
        const ix = await buildLeaveGuildIx({
          connection,
          walletPublicKey: selectedAccount.publicKey,
          guild,
        })
        await runTx(ix)
        applyMembershipDelta(row.tokenMint, row.founderWallet, -1, guild.toBase58())
        refresh()
        rank.refresh()
      } catch (e) {
        setErr(friendlyErrorMessage(e))
      } finally {
        setBusyMint(null)
      }
    },
    [selectedAccount, connection, rank, runTx, applyMembershipDelta, refresh],
  )

  const founderWallets = useMemo(
    () => new Set(guilds.filter((g) => g.guildPda).map((g) => g.founderWallet)),
    [guilds],
  )
  const founderWalletToHouseMint = useMemo(
    () => new Map(guilds.filter((g) => g.guildPda).map((g) => [g.founderWallet, g.tokenMint])),
    [guilds],
  )

  const renderRow = useCallback(
    ({ item }: { item: GuildRow }) => {
      const isCurrent = item.founderWallet === currentFounder
      const belowFloor =
        item.marketCapUsd !== undefined && item.marketCapUsd < GUILD_MARKET_CAP_FLOOR_USD
      const busy = busyMint === item.tokenMint
      return (
        <Card style={styles.row}>
          <Card.Content>
            <View style={styles.rowTop}>
              <View style={styles.rowTitle}>
                <TokenIcon
                  option={{ key: item.tokenMint, symbol: item.symbol || 'H', icon: icons[item.tokenMint] }}
                  size={22}
                />
                <Text variant="titleMedium" style={styles.flex1}>
                  {item.symbol || shortAddr(item.tokenMint)}
                </Text>
              </View>
              {isCurrent ? (
                <Button
                  compact
                  mode="contained"
                  buttonColor="#ffffff"
                  textColor="#000000"
                  contentStyle={styles.btnPadding}
                  loading={busy}
                  disabled={busy || !selectedAccount}
                  onPress={() => onLeave(item)}
                >
                  Leave
                </Button>
              ) : (
                <Button
                  compact
                  mode="contained"
                  buttonColor={C.bgHover}
                  textColor={C.textPrimary}
                  contentStyle={styles.btnPadding}
                  loading={busy}
                  disabled={busy || belowFloor || !selectedAccount}
                  onPress={() => onJoin(item)}
                >
                  {inAGuild ? 'Switch' : 'Join'}
                </Button>
              )}
            </View>
            <View style={styles.statsRow}>
              <Text variant="bodySmall" style={styles.dim}>
                {item.marketCapUsd !== undefined
                  ? `Market Cap ${formatUsdCompact(item.marketCapUsd)}`
                  : 'Market Cap —'}
              </Text>
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
    [currentFounder, busyMint, selectedAccount, inAGuild, onJoin, onLeave, icons],
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
            { value: 'fees', label: 'Fees sent' },
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

      {tab === 'houses' ? (
        <FlatList
          data={guilds}
          keyExtractor={(g) => g.tokenMint}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            currentRow ? (
              <CurrentHouseHighlight
                row={currentRow}
                icon={icons[currentRow.tokenMint]}
                busy={busyMint === currentRow.tokenMint}
                onLeave={() => onLeave(currentRow)}
              />
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
      ) : tab === 'fees' ? (
        <FeesSentTab
          founderWalletsSize={founderWallets.size}
          founderWalletToHouseMint={founderWalletToHouseMint}
        />
      ) : (
        <AddHouseTab guilds={guilds} onAdd={addManualRow} />
      )}
    </View>
  )
}

// Your active House — yellow highlight, same content as the web app's own
// CurrentGuildHighlight (GuildsPage.tsx): token badge, crown + "Your house",
// fees earned + member count, Leave.
function CurrentHouseHighlight({
  row,
  icon,
  busy,
  onLeave,
}: {
  row: GuildRow
  icon?: string
  busy: boolean
  onLeave: () => void
}) {
  return (
    <View style={styles.highlight}>
      <View style={styles.highlightBadge}>
        <TokenIcon option={{ key: row.tokenMint, symbol: row.symbol || 'H', icon }} size={18} />
        <Text style={styles.highlightSymbol}>{row.symbol || shortAddr(row.tokenMint)}</Text>
      </View>
      <View style={styles.highlightHouseRow}>
        <FontAwesome6 name="crown" size={11} color={C.accentTextOn} />
        <Text style={styles.highlightHouseText}>Your house</Text>
      </View>
      <View style={styles.highlightSpacer} />
      <View style={styles.highlightFeeBlock}>
        <Text style={styles.highlightFee}>{formatUsdCompact(row.totalFeesEarnedUsd)}</Text>
        <Text style={styles.highlightMembers}>
          {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
        </Text>
      </View>
      <Button
        mode="contained"
        buttonColor={C.bg}
        textColor={C.textPrimary}
        contentStyle={styles.btnPadding}
        compact
        loading={busy}
        disabled={busy}
        onPress={onLeave}
      >
        Leave
      </Button>
    </View>
  )
}

// Recent house-fee payouts — same content as FeesEarnedTab on web.
function FeesSentTab({
  founderWalletsSize,
  founderWalletToHouseMint,
}: {
  founderWalletsSize: number
  founderWalletToHouseMint: Map<string, string>
}) {
  const { rows, loading, error } = useGuildFeeHistory(founderWalletsSize)

  // Own icon set, not the Houses tab's — a fee can be paid in a currency
  // (SOL/USDC/etc) that never appears in the Houses list at all, and a
  // payout's house might not be in the CURRENT discovery/manual list either
  // (an older founder wallet). Fetching from the rows actually shown here is
  // the only way both the house badge and the fee-currency badge reliably
  // resolve to a real icon instead of the yellow-circle+letter fallback.
  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => {
    if (rows.length === 0) return
    const mints = [
      ...new Set(
        rows.flatMap((r) => [founderWalletToHouseMint.get(r.founderWallet) ?? r.mint, r.mint]),
      ),
    ]
    getTokenInfos(mints)
      .then((infos) => {
        const next: Record<string, string> = {}
        for (const [mint, info] of Object.entries(infos)) if (info.icon) next[mint] = info.icon
        setIcons((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length])

  return (
    <ScrollView contentContainerStyle={[styles.list, styles.feesListTop]}>
      {loading && rows.length === 0 ? <ActivityIndicator style={styles.loading} /> : null}
      {error ? (
        <Text style={[styles.loading, styles.errorText]}>Couldn&apos;t load history: {error}</Text>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <Text style={styles.loading}>No house-fee transactions yet.</Text>
      ) : null}
      {rows.map((row) => {
        const houseMint = founderWalletToHouseMint.get(row.founderWallet) ?? row.mint
        return (
          <Card key={row.signature} style={styles.row}>
            <Card.Content style={styles.feeRow}>
              <View style={styles.feeRowLeft}>
                <TokenIcon option={{ key: houseMint, symbol: 'H', icon: icons[houseMint] }} size={22} />
              </View>
              <TouchableRipple
                style={styles.feeTxRow}
                onPress={() => Linking.openURL(solscanTxUrl(row.signature))}
              >
                <>
                  <Text variant="bodySmall" style={styles.feeTx}>
                    {shortAddr(row.signature)}
                  </Text>
                  <FontAwesome6 name="arrow-up-right-from-square" size={10} color={C.textSecondary} />
                </>
              </TouchableRipple>
              <View style={styles.feeAmountRow}>
                <TokenIcon option={{ key: row.mint, symbol: 'T', icon: icons[row.mint] }} size={14} />
                <Text style={styles.feeAmount}>{formatUsdCompact(row.usdAmount)}</Text>
              </View>
            </Card.Content>
          </Card>
        )
      })}

      <Text variant="bodySmall" style={styles.feesNote}>
        Most recent house-fee payouts, newest first.
      </Text>
    </ScrollView>
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

  highlight: {
    backgroundColor: C.accent,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
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
  highlightSpacer: { flex: 1 },
  highlightFeeBlock: { alignItems: 'flex-end' },
  highlightFee: { color: C.accentTextOn, fontWeight: '700', fontSize: 16 },
  highlightMembers: { color: 'rgba(0,0,0,0.6)', fontSize: 11 },

  // Note sits below the list now (moved per user request) — top margin, not
  // bottom.
  feesNote: { color: C.textSecondary, marginTop: 8, textAlign: 'center' },
  // +10px on top of `list`'s own top padding.
  feesListTop: { paddingTop: 10 },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feeRowLeft: { flexShrink: 0 },
  feeTxRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeTx: { color: C.textSecondary },
  feeAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeAmount: { color: C.positive, fontWeight: '700' },

  addCard: { backgroundColor: C.bgElevated, borderRadius: 16, padding: 16 },
  addTitle: { color: C.textPrimary, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addInput: { flex: 1, backgroundColor: 'transparent' },
  addHelper: { color: C.textSecondary, marginTop: 10 },
})
