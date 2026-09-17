import React, { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Menu, Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SWAPKINGS_COLORS } from "../theme";
import { dexscreenerIconUrl } from "../swapkings/jupiterInfo";
import { formatTokenAmountCompact } from "../swapkings/format";

export interface TokenOption {
  key: string;
  symbol: string;
  icon?: string;
  mint?: string;
  // Wallet-held amount, shown gray next to the row in the picker so you can
  // see what you actually hold instead of only the fixed preset list (user
  // feedback, 2026-09-17). Not set on `selected` — only options list rows.
  balance?: number;
}

// The token selector "pill" from the reference (icon + symbol + chevron,
// opens a picker) — reused for both the Sell and Buy sides.
export function TokenPill({
  selected,
  options,
  onSelect,
  onCustom,
}: {
  selected: TokenOption;
  options: TokenOption[];
  onSelect: (key: string) => void;
  onCustom: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableRipple style={styles.pill} onPress={() => setVisible(true)} borderless>
          <View style={styles.pillContent}>
            <TokenIcon option={selected} size={22} />
            <Text variant="titleMedium" style={styles.symbol}>
              {selected.symbol}
            </Text>
            <FontAwesome6 name="chevron-down" size={10} color={SWAPKINGS_COLORS.textSecondary} />
          </View>
        </TouchableRipple>
      }
    >
      {options.map((o) => (
        <Menu.Item
          key={o.key}
          onPress={() => {
            setVisible(false);
            onSelect(o.key);
          }}
          title={o.symbol}
          leadingIcon={() => <TokenIcon option={o} size={20} />}
          trailingIcon={
            o.balance
              ? () => (
                  <Text style={styles.balance} numberOfLines={1}>
                    {formatTokenAmountCompact(o.balance!)}
                  </Text>
                )
              : undefined
          }
        />
      ))}
      <Menu.Item
        onPress={() => {
          setVisible(false);
          onCustom();
        }}
        title="Paste a mint address…"
      />
    </Menu>
  );
}

export function TokenIcon({ option, size }: { option: TokenOption; size: number }) {
  // DexScreener re-hosts token images on its own CDN keyed only by mint (no
  // lookup call, no dependency on the launchpad's own storage) — tried
  // first since it's reliable even for the pump.fun/Token-2022 tokens whose
  // Jupiter-reported `icon` (arweave/irys/pinata) 404s constantly (confirmed
  // live, 2026-09-15: most Houses-list icons were failing this way). Jupiter's
  // `icon` is kept as a second attempt for anything DexScreener hasn't
  // indexed yet, then the plain letter circle.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (option.mint) list.push(dexscreenerIconUrl(option.mint));
    if (option.icon) list.push(option.icon);
    return list;
  }, [option.mint, option.icon]);
  const [index, setIndex] = useState(0);
  const [seenCandidates, setSeenCandidates] = useState(candidates);
  if (candidates.join("|") !== seenCandidates.join("|")) {
    setSeenCandidates(candidates);
    setIndex(0);
  }

  const uri = candidates[index];
  if (uri) {
    return (
      <Image
        key={uri}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setIndex((i) => i + 1)}
      />
    );
  }
  return (
    <View style={[styles.fallbackIcon, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.fallbackLetter}>{option.symbol.slice(0, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: SWAPKINGS_COLORS.bgHover,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 116,
  },
  pillContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  symbol: { color: SWAPKINGS_COLORS.textPrimary, fontWeight: "600", lineHeight: 22 },
  fallbackIcon: {
    backgroundColor: SWAPKINGS_COLORS.bgHover,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackLetter: { color: SWAPKINGS_COLORS.textSecondary, fontWeight: "700", fontSize: 11 },
  balance: { color: SWAPKINGS_COLORS.textSecondary, fontSize: 12 },
});
