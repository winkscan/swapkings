import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Menu, Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SWAPKINGS_COLORS } from "../theme";

export interface TokenOption {
  key: string;
  symbol: string;
  icon?: string;
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
  const [failCount, setFailCount] = useState(0);
  // Reset once a different (or newly-resolved) icon URL comes in — otherwise
  // a token whose icon loaded fine gets stuck on the grey fallback forever
  // the moment ANY previous URL for that same slot ever failed.
  const [lastIcon, setLastIcon] = useState(option.icon);
  if (option.icon !== lastIcon) {
    setLastIcon(option.icon);
    setFailCount(0);
  }
  // Many houses' icons live on arweave/irys gateways that are genuinely
  // flaky — a real 404 that clears up a moment later once the gateway's own
  // cache catches up (confirmed live, 2026-09-11: `x-cache-status: UPDATING`
  // on a failed fetch of a URL Jupiter itself just returned as current). One
  // retry after a short delay recovers a real chunk of those instead of
  // permanently showing the fallback for a token that does have real art.
  if (option.icon && failCount < 2) {
    return (
      <Image
        key={`${option.icon}-${failCount}`}
        source={{ uri: option.icon }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setTimeout(() => setFailCount((n) => n + 1), 800)}
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
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  symbol: { color: SWAPKINGS_COLORS.textPrimary, fontWeight: "600" },
  fallbackIcon: {
    backgroundColor: SWAPKINGS_COLORS.bgHover,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackLetter: { color: SWAPKINGS_COLORS.textSecondary, fontWeight: "700", fontSize: 11 },
});
