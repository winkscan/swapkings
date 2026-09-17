import React, { useCallback, useState } from 'react'
import { Share, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput, TouchableRipple } from 'react-native-paper'
import { ScrollView } from 'react-native'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import * as Clipboard from 'expo-clipboard'

import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useRank } from '../swapkings/useRank'
import { useFriends, type FriendRow } from '../swapkings/useFriends'
import { useTxRunner } from '../swapkings/txRunner'
import { claimReferralCode, referralLink, usePendingReferralCode } from '../swapkings/referral'
import { referralCodeToString, ZERO_PUBKEY } from '../swapkings/pdas'
import { friendlyErrorMessage } from '../swapkings/walletErrors'
import { shortAddr, formatUsdCompact } from '../swapkings/format'
import { SWAPKINGS_COLORS as C } from '../theme'

// Same layout/copy as the web app's own FriendsPage (FriendsList.tsx +
// ReferralCard.tsx) — banner → white summary card → invite card → detail
// table (Alexey's explicit ask 2026-09-17: "bring the Friends page to the
// common design, take the example from the site"). The one deliberate
// addition over web: a manual "enter a friend's code" field, since mobile
// has no URL bar to capture `?ref=` from — see referral.ts's own comment.
function FriendsSummaryCard({ friendCount, totalEarnedUsd, loading }: { friendCount: number; totalEarnedUsd: number; loading: boolean }) {
  return (
    <View style={styles.summaryCard}>
      <View>
        <Text style={styles.summaryValue}>{loading ? '…' : friendCount}</Text>
        <View style={styles.summaryLabelRow}>
          <FontAwesome6 name="user-group" size={12} color="rgba(0,0,0,0.6)" />
          <Text style={styles.summaryLabel}>Friends invited</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.summaryValue}>{loading ? '…' : formatUsdCompact(totalEarnedUsd)}</Text>
        <Text style={styles.summaryLabel}>Total earned</Text>
      </View>
    </View>
  )
}

function FriendsTableCard({ friends, loading }: { friends: FriendRow[]; loading: boolean }) {
  return (
    <View style={[styles.card, styles.tableCard]}>
      {loading ? (
        <Text style={styles.emptyText}>Loading…</Text>
      ) : friends.length === 0 ? (
        <Text style={styles.emptyText}>No friends yet — share your link above to start earning.</Text>
      ) : (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.friendCol]}>FRIEND</Text>
            <Text style={[styles.headerCell, styles.earnedCol]}>EARNED</Text>
          </View>
          {friends.map((f, i) => (
            <View key={f.wallet} style={[styles.row, i === friends.length - 1 && styles.rowLast]}>
              <Text style={[styles.friendCell, styles.friendCol]}>{shortAddr(f.wallet)}</Text>
              <Text style={[styles.earnedCell, styles.earnedCol]}>{formatUsdCompact(f.earnedUsd)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

export function ReferralScreen() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const runTx = useTxRunner()
  const rank = useRank()
  const { friends, totalEarnedUsd, loading: friendsLoading } = useFriends()
  const { code: pendingCode, setCode: setPendingCode } = usePendingReferralCode()

  const [claiming, setClaiming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [friendInput, setFriendInput] = useState('')
  const [copied, setCopied] = useState(false)

  const myCode = rank.stats.myReferralCode.length
    ? referralCodeToString(rank.stats.myReferralCode)
    : null
  const myLink = myCode ? referralLink(myCode) : null
  const hasReferrer = !rank.stats.referrer.equals(ZERO_PUBKEY)

  const onClaim = useCallback(async () => {
    if (!selectedAccount) return
    setClaiming(true)
    setErr(null)
    try {
      await claimReferralCode(connection, selectedAccount.publicKey, runTx)
      rank.refresh()
    } catch (e) {
      setErr(friendlyErrorMessage(e))
    } finally {
      setClaiming(false)
    }
  }, [selectedAccount, connection, runTx, rank])

  const onShare = useCallback(() => {
    if (!myLink) return
    Share.share({ message: `Swap on SwapKings with my link — we both earn: ${myLink}` }).catch(
      () => {},
    )
  }, [myLink])

  const onCopy = useCallback(() => {
    if (!myLink) return
    Clipboard.setStringAsync(myLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [myLink])

  if (!selectedAccount) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.mb}>
          Connect your wallet for your referral link
        </Text>
        <Button
          mode="contained"
          onPress={() => connect()}
          style={styles.btnRadius}
          icon={({ size, color }) => <FontAwesome6 name="wallet" size={size * 0.85} color={color} />}
        >
          Connect wallet
        </Button>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {hasReferrer ? (
        <View style={styles.banner}>
          <FontAwesome6 name="circle-check" size={20} color={C.positive} />
          <Text style={styles.bannerText}>You were invited by someone — thanks for joining!</Text>
        </View>
      ) : null}

      <FriendsSummaryCard friendCount={friends.length} totalEarnedUsd={totalEarnedUsd} loading={friendsLoading} />

      <View style={[styles.card, styles.inviteCard]}>
        <Text variant="titleLarge" style={styles.inviteTitle}>
          Invite friends
        </Text>
        <Text variant="bodySmall" style={styles.inviteSubtitle}>
          Earn 50% of their platform fee on every swap they make, permanently.
        </Text>
        <View style={styles.inviteBtnRow}>
          {myLink ? (
            <>
              <Button
                mode="contained"
                style={styles.btnRadius}
                icon={({ size, color }) => (
                  <FontAwesome6 name={copied ? 'check' : 'copy'} size={size} color={color} />
                )}
                onPress={onCopy}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <TouchableRipple style={styles.shareBtn} onPress={onShare} borderless>
                <FontAwesome6 name="share-nodes" size={14} color={C.textPrimary} />
              </TouchableRipple>
            </>
          ) : (
            <Button
              mode="contained"
              onPress={onClaim}
              loading={claiming}
              disabled={claiming}
              style={styles.btnRadius}
              icon={({ size, color }) => <FontAwesome6 name="user-plus" size={size * 0.85} color={color} />}
            >
              {claiming ? 'Getting your link…' : 'Get my link'}
            </Button>
          )}
        </View>
        {err ? (
          <HelperText type="error" visible>
            {err}
          </HelperText>
        ) : null}
      </View>

      {!hasReferrer ? (
        pendingCode ? (
          <View style={[styles.card, styles.codeCard]}>
            <Text variant="bodyMedium" style={styles.codeSavedText}>
              Friend&apos;s code saved: <Text style={styles.bold}>{pendingCode}</Text>
            </Text>
            <Text variant="bodySmall" style={styles.inviteSubtitle}>
              It attaches to your wallet on your next swap.
            </Text>
            <Button
              mode="text"
              onPress={() => setPendingCode(null)}
              icon={({ size, color }) => <FontAwesome6 name="xmark" size={size * 0.85} color={color} />}
            >
              Clear
            </Button>
          </View>
        ) : (
          <View style={[styles.card, styles.codeCard]}>
            <Text variant="titleLarge" style={styles.inviteTitle}>
              Were you referred?
            </Text>
            <TextInput
              mode="outlined"
              label="Friend's referral code"
              autoCapitalize="none"
              autoCorrect={false}
              value={friendInput}
              onChangeText={setFriendInput}
              style={styles.mt}
            />
            <Button
              mode="outlined"
              disabled={friendInput.trim().length < 3}
              onPress={() => {
                setPendingCode(friendInput.trim())
                setFriendInput('')
              }}
              style={[styles.mt, styles.btnRadius]}
              icon={({ size, color }) => <FontAwesome6 name="check" size={size * 0.85} color={color} />}
            >
              Save code
            </Button>
          </View>
        )
      ) : null}

      <FriendsTableCard friends={friends} loading={friendsLoading} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mb: { marginBottom: 16, textAlign: 'center' },
  btnRadius: { borderRadius: 16 },
  card: { backgroundColor: C.bgElevated, borderRadius: 20, padding: 16 },
  mt: { marginTop: 10 },
  bold: { fontWeight: 'bold' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.bgElevated,
    borderRadius: 20,
    padding: 16,
  },
  bannerText: { color: C.textSecondary, fontSize: 13, flexShrink: 1 },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryValue: { fontSize: 22, fontWeight: '700', color: '#000' },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  summaryLabel: { fontSize: 12, color: 'rgba(0,0,0,0.6)' },

  inviteCard: { alignItems: 'center' },
  inviteTitle: { color: C.textPrimary, fontWeight: '700' },
  inviteSubtitle: { color: C.textSecondary, marginTop: 4, marginBottom: 16, textAlign: 'center' },
  inviteBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bgHover,
    alignItems: 'center',
    justifyContent: 'center',
  },

  codeCard: {},
  codeSavedText: { color: C.textPrimary },

  tableCard: {},
  emptyText: { color: C.textSecondary, textAlign: 'center', paddingVertical: 8 },
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
  friendCol: { flex: 1 },
  earnedCol: { flex: 1, textAlign: 'right' },
  friendCell: { color: C.textSecondary },
  earnedCell: { color: C.positive, fontWeight: '700', textAlign: 'right' },
})
