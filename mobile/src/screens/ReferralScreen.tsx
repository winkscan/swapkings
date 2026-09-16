import React, { useCallback, useState } from 'react'
import { ScrollView, Share, StyleSheet, View } from 'react-native'
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import * as Clipboard from 'expo-clipboard'

import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useRank } from '../swapkings/useRank'
import { useTxRunner } from '../swapkings/txRunner'
import { claimReferralCode, referralLink, usePendingReferralCode } from '../swapkings/referral'
import { referralCodeToString, ZERO_PUBKEY } from '../swapkings/pdas'
import { friendlyErrorMessage } from '../swapkings/walletErrors'
import { shortAddr } from '../swapkings/format'
import { SWAPKINGS_COLORS } from '../theme'

export function ReferralScreen() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const runTx = useTxRunner()
  const rank = useRank()
  const { code: pendingCode, setCode: setPendingCode } = usePendingReferralCode()

  const [claiming, setClaiming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [friendInput, setFriendInput] = useState('')

  const myCode = rank.stats.myReferralCode.length
    ? referralCodeToString(rank.stats.myReferralCode)
    : null
  const myLink = myCode ? referralLink(myCode) : null
  const referredBy = rank.stats.referrer.equals(ZERO_PUBKEY)
    ? null
    : rank.stats.referrer.toBase58()

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
    if (myLink) Clipboard.setStringAsync(myLink).catch(() => {})
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
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.cardTitle}>
            Your referral link
          </Text>
          <Text variant="bodySmall" style={styles.dim}>
            You earn 50% of the platform fee on every swap anyone you refer makes — forever, in the
            same transaction.
          </Text>

          {myLink ? (
            <>
              <Text selectable variant="bodyMedium" style={styles.link}>
                {myLink}
              </Text>
              <View style={styles.rowBtns}>
                <Button
                  mode="contained"
                  style={styles.btnRadius}
                  icon={({ size, color }) => (
                    <FontAwesome6 name="share-nodes" size={size} color={color} />
                  )}
                  onPress={onShare}
                >
                  Share
                </Button>
                <Button
                  mode="outlined"
                  style={styles.btnRadius}
                  icon={({ size, color }) => <FontAwesome6 name="copy" size={size} color={color} />}
                  onPress={onCopy}
                >
                  Copy
                </Button>
              </View>
            </>
          ) : (
            <Button
              mode="contained"
              onPress={onClaim}
              loading={claiming}
              disabled={claiming}
              style={[styles.mt, styles.btnRadius]}
              icon={({ size, color }) => <FontAwesome6 name="link" size={size * 0.85} color={color} />}
            >
              {claiming ? 'Claiming…' : 'Claim your link'}
            </Button>
          )}
          {err ? (
            <HelperText type="error" visible>
              {err}
            </HelperText>
          ) : null}
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.cardTitle}>
            Were you referred?
          </Text>
          {referredBy ? (
            <Text variant="bodyMedium" style={styles.mt}>
              Referred by {shortAddr(referredBy)} — locked in on-chain.
            </Text>
          ) : pendingCode ? (
            <>
              <Text variant="bodyMedium" style={styles.mt}>
                Friend&apos;s code saved: <Text style={styles.bold}>{pendingCode}</Text>
              </Text>
              <Text variant="bodySmall" style={styles.dim}>
                It attaches to your wallet on your next swap.
              </Text>
              <Button
                mode="text"
                onPress={() => setPendingCode(null)}
                icon={({ size, color }) => <FontAwesome6 name="xmark" size={size * 0.85} color={color} />}
              >
                Clear
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mb: { marginBottom: 16, textAlign: 'center' },
  card: { marginBottom: 20 },
  // Same size/weight as every other card heading in the app (Rank's own
  // "Rank tiers" title is the reference).
  cardTitle: { color: SWAPKINGS_COLORS.textPrimary, fontWeight: '700', marginBottom: 4 },
  btnRadius: { borderRadius: 16 },
  dim: { opacity: 0.7, marginTop: 4 },
  link: { color: SWAPKINGS_COLORS.accent, marginVertical: 10 },
  rowBtns: { flexDirection: 'row', gap: 10 },
  mt: { marginTop: 10 },
  bold: { fontWeight: 'bold' },
})
