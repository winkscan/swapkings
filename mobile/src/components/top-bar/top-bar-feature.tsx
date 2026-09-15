import { Linking, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { TopBarWalletMenu } from "./top-bar-ui";
import { UpdateBadge } from "./UpdateBadge";
import { SWAPKINGS_COLORS as C } from "../../theme";

// Matches swapkings.app's own header exactly: crown + "SwapKings" wordmark on
// the left, the X (Twitter) link and the wallet button (icon + green
// "connected" dot) on the right. The gear/Settings entry point moved into
// the wallet dropdown ("Network") since the reference header has no third
// icon — see top-bar-ui.tsx.
export function TopBar() {
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <FontAwesome6 name="crown" size={18} color={C.accent} />
        <Text variant="titleMedium" style={styles.title}>
          SwapKings
        </Text>
      </View>
      <View style={styles.right}>
        <UpdateBadge />
        <TouchableRipple
          style={styles.iconButton}
          onPress={() => Linking.openURL("https://x.com/SwapKingsApp")}
          borderless
        >
          <FontAwesome6 name="x-twitter" size={16} color={C.textSecondary} />
        </TouchableRipple>
        <TopBarWalletMenu />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.bg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.textPrimary, fontWeight: "700" },
  right: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
