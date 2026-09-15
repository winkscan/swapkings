import React, { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { List, Text } from 'react-native-paper'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'

import { GUILD_MARKET_CAP_FLOOR_USD } from '../swapkings/pumpfun'
import { formatUsdCompact } from '../swapkings/format'
import { SWAPKINGS_COLORS as C } from '../theme'

// Same content as the web app's own RulesPage.tsx ("How It Works" / Guide
// nav link), carried over 1:1 — just reshaped into collapsible accordions
// (first one open by default) instead of always-expanded cards, since a
// phone screen can't show all 6 sections at once the way the web page does.
const TIER_INFO = [
  { emoji: '🔰', name: 'Initiate', range: '$0 – $5K', discount: '0%' },
  { emoji: '⚔️', name: 'Adept', range: '$5K – $50K', discount: '12.5%' },
  { emoji: '🛡️', name: 'Veteran', range: '$50K – $500K', discount: '25%' },
  { emoji: '🏰', name: 'Lord', range: '$500K – $5M', discount: '37.5%' },
  { emoji: '👑', name: 'King', range: '$5M+', discount: '50%' },
]

const FEE_SPLIT_ROWS = [
  { guild: 'No', referrer: 'No', founder: '—', ref: '—', platform: '100%' },
  { guild: 'No', referrer: 'Yes', founder: '—', ref: '50%', platform: '50%' },
  { guild: 'Yes', referrer: 'No', founder: '90%', ref: '—', platform: '10%' },
  { guild: 'Yes', referrer: 'Yes', founder: '40%', ref: '50%', platform: '10%' },
]

type SectionKey = 'why' | 'houses' | 'fees' | 'rank' | 'friends' | 'security'

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>
}

function GuideSection({
  icon,
  title,
  expanded,
  onToggle,
  children,
}: {
  icon: string
  title: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <View style={styles.card}>
      <List.Accordion
        title={title}
        expanded={expanded}
        onPress={onToggle}
        left={() => (
          <View style={styles.iconWrap}>
            <FontAwesome6 name={icon} size={15} color={C.accent} />
          </View>
        )}
        style={styles.accordionHeader}
        titleStyle={styles.accordionTitle}
      >
        <View style={styles.body}>{children}</View>
      </List.Accordion>
    </View>
  )
}

function FeeSplitTable() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
      <View>
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cell, styles.headCell, styles.colHouse]}>In a house?</Text>
          <Text style={[styles.cell, styles.headCell, styles.colReferred]}>Referred?</Text>
          <Text style={[styles.cell, styles.headCell, styles.colWide]}>House founder</Text>
          <Text style={[styles.cell, styles.headCell, styles.colWide]}>Referrer</Text>
          <Text style={[styles.cell, styles.headCell, styles.colWide]}>Platform</Text>
        </View>
        {FEE_SPLIT_ROWS.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.cell, styles.dim, styles.colHouse]}>{r.guild}</Text>
            <Text style={[styles.cell, styles.dim, styles.colReferred]}>{r.referrer}</Text>
            <Text style={[styles.cell, styles.positive, styles.colWide]}>{r.founder}</Text>
            <Text style={[styles.cell, styles.positive, styles.colWide]}>{r.ref}</Text>
            <Text style={[styles.cell, styles.dim, styles.colWide]}>{r.platform}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function TierTable() {
  return (
    <View>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cell, styles.headCell, styles.flex1]}>Tier</Text>
        <Text style={[styles.cell, styles.headCell, styles.flex1]}>Lifetime volume</Text>
        <Text style={[styles.cell, styles.headCell, styles.flex1]}>Fee discount</Text>
      </View>
      {TIER_INFO.map((t) => (
        <View key={t.name} style={styles.row}>
          <Text style={[styles.cell, styles.flex1]}>
            {t.emoji} {t.name}
          </Text>
          <Text style={[styles.cell, styles.dim, styles.flex1]}>{t.range}</Text>
          <Text style={[styles.cell, styles.positive, styles.flex1]}>{t.discount}</Text>
        </View>
      ))}
    </View>
  )
}

export function GuideScreen() {
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set(['why']))
  const toggle = (key: SectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.h1}>
        How It Works
      </Text>
      <Text style={styles.subtitle}>
        Fees, Rank, Houses, and Friends — the mechanics behind SwapKings.
      </Text>

      <GuideSection
        icon="lightbulb"
        title="Why"
        expanded={expanded.has('why')}
        onToggle={() => toggle('why')}
      >
        <P>
          On every launchpad, a token's founder only ever earns from trades of that one token, in
          that one pair. Someone can love a project, hold it, talk about it every day — and the
          founder sees nothing unless that exact token gets traded.
        </P>
        <P>
          SwapKings breaks that link. Join a project's house, and{' '}
          <Bold>
            up to 90% of your platform fee flows to that founder on every swap you make anywhere
            on SwapKings
          </Bold>{' '}
          — SOL to USDC, one meme coin to another, anything at all. You don't have to trade the
          token itself to support its creator. A whole community can now turn into real, ongoing
          revenue for the founder they believe in, no matter what they're actually swapping.
        </P>
      </GuideSection>

      <GuideSection
        icon="shield"
        title="Houses"
        expanded={expanded.has('houses')}
        onToggle={() => toggle('houses')}
      >
        <P>
          Any token launched on a qualifying launchpad, above a{' '}
          {formatUsdCompact(GUILD_MARKET_CAP_FLOOR_USD)} market cap, has its own house. Joining is
          free and instant — no invite needed, no cost beyond the swap you were already making.
          Once you've joined, <Bold>up to 90% of your platform fee on every swap you make anywhere
          on SwapKings</Bold> — not just swaps involving that token — routes straight to that
          token's original creator wallet, instantly, in the same transaction as your swap (40% if
          you also have a referrer — see the table below). SwapKings always keeps 10%.
        </P>
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>Supported launchpads today</Text>
          <Text style={styles.infoBoxText}>
            pump.fun, letsbonk.fun, Meteora, Jupiter Studio, and Moonshot
          </Text>
          <Text style={styles.infoBoxNote}>
            We only ever route real money to a wallet we can verify is a token's actual creator —
            confirmed automatically through the token's own on-chain launch data, never a manual
            list. A token from any other launchpad, or a plain wallet-to-wallet token with no
            fair-launch record, can't become a house — there's no creator wallet we could safely
            trust to route fees to. More launchpads may be added later, always following the same
            verification bar.
          </Text>
        </View>
        <P>
          A house is sticky: it stays your active house across every future swap until you switch
          to a different one or leave. Founders don't have to do anything to "activate" this — a
          house's founder wallet comes straight from public launchpad creator data the moment
          their token clears the market-cap floor.
        </P>
        <P>
          SwapKings doesn't create a house — it's just an existing token, already launched and
          already trading on its own, that we attach fee-routing to. We don't mint anything, don't
          touch the token's supply or liquidity, and don't run its chart or its community. All a
          house really is: SwapKings linking swappers to a token's real creator wallet and sending
          a share of platform fees there, automatically, for as long as they're in it.
        </P>
        <Text style={styles.pLast}>
          Check the Houses page for the full list, each house's member count, and how much it's
          earned so far.
        </Text>
      </GuideSection>

      <GuideSection
        icon="shield-halved"
        title="Fees"
        expanded={expanded.has('fees')}
        onToggle={() => toggle('fees')}
      >
        <P>
          SwapKings applies a small 0.2% platform fee to swaps routed through the app — deducted
          from the output you already received, in the very same transaction as the swap itself.
          There's no second confirmation, no separate step: one wallet approval, done.
        </P>
        <P>
          Your Rank tier (see below) discounts that fee automatically, up to 50% off at the top
          tier — capped there on purpose, so there's always a real remainder left to split with a
          house and/or referrer, no matter how high your own tier climbs. Whatever's left after
          your discount is then split, instantly, depending on whether you're in a house and/or
          were referred:
        </P>
        <FeeSplitTable />
        <Text style={styles.pLast}>
          Most wallets and swap apps quietly add their own fee on top of the best route they find
          — often more than what you'll pay here, with nothing shared back. SwapKings keeps that
          fee low and, unlike those apps, gives a real share of it to the creator communities and
          friends you actually chose.
        </Text>
      </GuideSection>

      <GuideSection
        icon="coins"
        title="Rank"
        expanded={expanded.has('rank')}
        onToggle={() => toggle('rank')}
      >
        <P>
          Rank is a loyalty tier based on your lifetime swap volume — it's not a token and can't be
          transferred or traded. It drives a guaranteed, deterministic discount on the platform
          fee: no chance involved, no drawing, just a lower fee the more you've swapped.
        </P>
        <TierTable />
      </GuideSection>

      <GuideSection
        icon="user-plus"
        title="Friends"
        expanded={expanded.has('friends')}
        onToggle={() => toggle('friends')}
      >
        <P>
          Invite a friend with your personal link and you'll earn a share of their platform fee on
          every swap they ever make — permanently, starting from their very first swap. Whoever
          refers a wallet is set once and never changes, so there's no re-attribution or "last
          click wins" games.
        </P>
        <P>
          A referral only counts once your friend makes one real swap — just opening your link or
          connecting a wallet isn't enough on its own.
        </P>
        <Text style={styles.pLast}>
          You always earn the same 50% of your friend's fee, whether or not they're in a house —
          bringing a friend along is worth the same either way. If they're not in a house, that's
          50% you / 50% SwapKings. If they're also in a house, the split becomes 50% you / 40% the
          house's founder / 10% SwapKings — your share never drops just because they joined a
          house too. See the fee table above for the full breakdown. Get your own link from the
          "Invite friends" card on the Swap page.
        </Text>
      </GuideSection>

      <GuideSection
        icon="lock"
        title="Security"
        expanded={expanded.has('security')}
        onToggle={() => toggle('security')}
      >
        <P>
          SwapKings runs entirely on-chain as a Solana program. There's no backend server holding
          your funds or deciding outcomes — every swap, fee split, and house membership happens
          through public, verifiable on-chain instructions, the same ones for every wallet.
        </P>
        <Text style={styles.pLast}>
          The program is still in its early testing phase, so it currently has an upgrade
          authority that allows fixes if something needs adjusting. That authority will be
          permanently removed once testing wraps up, locking the program's logic in place for
          good — after that, not even the SwapKings team will be able to change how it works.
        </Text>
      </GuideSection>

      <Text style={styles.disclaimer}>
        Swapping carries normal market risk. Nothing here is financial advice — swap responsibly.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  h1: { color: C.textPrimary, textAlign: 'center', marginBottom: 6 },
  subtitle: { color: C.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20 },

  card: {
    backgroundColor: C.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accordionHeader: { backgroundColor: C.bgElevated, paddingVertical: 2 },
  accordionTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '700' },
  iconWrap: { width: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },

  p: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 10 },
  pLast: { color: C.textSecondary, fontSize: 14, lineHeight: 21 },
  bold: { color: C.textPrimary, fontWeight: '700' },

  infoBox: {
    backgroundColor: C.bgInput,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  infoBoxTitle: { color: C.textPrimary, fontWeight: '600', fontSize: 13, marginBottom: 4 },
  infoBoxText: { color: C.textSecondary, fontSize: 13 },
  infoBoxNote: { color: C.textTertiary, fontSize: 12, marginTop: 8, lineHeight: 17 },

  tableScroll: { marginBottom: 10 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 8,
  },
  headRow: { borderBottomColor: C.borderStrong },
  cell: { color: C.textPrimary, fontSize: 13, paddingHorizontal: 6 },
  headCell: { color: C.textSecondary, fontWeight: '700', fontSize: 12 },
  flex1: { flex: 1, minWidth: 90 },
  colHouse: { width: 90 },
  colReferred: { width: 80 },
  colWide: { width: 110 },
  dim: { color: C.textSecondary },
  positive: { color: C.positive, fontWeight: '700' },

  disclaimer: {
    color: C.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
})
