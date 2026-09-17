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
  menuWidth,
}: {
  selected: TokenOption;
  options: TokenOption[];
  onSelect: (key: string) => void;
  onCustom: () => void;
  // Widens the opened dropdown to roughly the panel's own content width
  // (Alexey's explicit ask 2026-09-17, annotated screenshot: the popup
  // should span from about where "SELL" sits to the panel's right edge,
  // not stay pill-width). Paper's Menu clamps itself back on screen if this
  // would overflow, so it's safe to just ask for the wide size.
  menuWidth?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      contentStyle={menuWidth ? { width: menuWidth } : undefined}
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
        <TokenMenuRow
          key={o.key}
          option={o}
          onPress={() => {
            setVisible(false);
            onSelect(o.key);
          }}
        />
      ))}
      <TouchableRipple
        style={styles.menuRow}
        onPress={() => {
          setVisible(false);
          onCustom();
        }}
      >
        <Text style={styles.menuRowSymbol}>Paste a mint address…</Text>
      </TouchableRipple>
    </Menu>
  );
}

// A plain row, not react-native-paper's Menu.Item — its own MenuItem.tsx caps
// every row at MAX_WIDTH=280 regardless of the surrounding Menu's own width,
// and reserves a fixed 24px box for a trailingIcon (meant for a small glyph,
// not a balance string), which clipped the balance to "0…." and left the
// symbol/balance visibly off the same line (confirmed live 2026-09-17,
// screenshot: content stopped well short of the now-wide dropdown's real
// edge). A single flex row we own completely sidesteps both — `Menu`'s own
// children render directly inside its Surface with no such wrapper.
function TokenMenuRow({ option, onPress }: { option: TokenOption; onPress: () => void }) {
  return (
    <TouchableRipple style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuRowContent}>
        <TokenIcon option={option} size={22} />
        <Text style={styles.menuRowSymbol} numberOfLines={1}>
          {option.symbol}
        </Text>
        {option.balance ? (
          <Text style={styles.menuRowBalance} numberOfLines={1}>
            {formatTokenAmountCompact(option.balance)}
          </Text>
        ) : null}
      </View>
    </TouchableRipple>
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
  menuRow: { paddingVertical: 12, paddingHorizontal: 16 },
  menuRowContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuRowSymbol: { flex: 1, color: SWAPKINGS_COLORS.textPrimary, fontWeight: "600", fontSize: 16 },
  menuRowBalance: { color: SWAPKINGS_COLORS.textSecondary, fontSize: 12, flexShrink: 0 },
});
