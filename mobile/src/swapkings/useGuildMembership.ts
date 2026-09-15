import { useCallback, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'

import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useTxRunner } from './txRunner'
import { useGuilds, type GuildRow } from './useGuilds'
import { useRank } from './useRank'
import { buildJoinGuildIxs, buildLeaveGuildIx } from './guildActions'
import { guildPda as deriveGuildPda, ZERO_PUBKEY } from './pdas'
import { friendlyErrorMessage } from './walletErrors'

// Join/leave + "which house am I in" logic shared by the Houses list and the
// House detail screen — factored out so both stay in sync on refresh/rank
// updates instead of each keeping its own copy.
export function useGuildMembership() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const runTx = useTxRunner()
  const { guilds, loading, refresh, applyMembershipDelta } = useGuilds()
  const rank = useRank()

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

  return {
    guilds,
    loading,
    refresh,
    selectedAccount,
    currentFounder,
    currentRow,
    inAGuild,
    onJoin,
    onLeave,
    busyMint,
    err,
  }
}
