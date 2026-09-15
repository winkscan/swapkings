import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { SWAPKINGS_COLORS } from "../theme";

// Custom numeric keypad, replacing the OS keyboard for amount entry — matches
// the Solflare/Jupiter-style reference the user gave for this screen (tap
// digits below a big, non-editable amount display instead of a text field
// with a system keyboard).
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function Keypad({ onKeyPress }: { onKeyPress: (key: string) => void }) {
  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <TouchableRipple key={k} style={styles.key} onPress={() => onKeyPress(k)}>
          <Text variant="headlineSmall" style={styles.keyText}>
            {k}
          </Text>
        </TouchableRipple>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  key: {
    width: "33.333%",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { color: SWAPKINGS_COLORS.textPrimary, fontWeight: "500" },
});
