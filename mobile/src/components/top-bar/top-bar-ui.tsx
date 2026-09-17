import { StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { Menu, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Account, useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { useCluster } from "../cluster/cluster-data-access";
import { SWAPKINGS_COLORS as C } from "../../theme";

// Icon-only circular wallet button + green "connected" dot — matches
// swapkings.app's own header (wallet icon, no address text in the header
// itself; the address/network/disconnect actions live in the dropdown).
export function TopBarWalletButton({
  selectedAccount,
  openMenu,
}: {
  selectedAccount: Account | null;
  openMenu: () => void;
}) {
  const { connect } = useMobileWallet();
  return (
    <TouchableRipple
      style={styles.walletButton}
      onPress={selectedAccount ? openMenu : connect}
      borderless
    >
      <View>
        <FontAwesome6 name="wallet" size={16} color={C.textPrimary} />
        {selectedAccount ? <View style={styles.connectedDot} /> : null}
      </View>
    </TouchableRipple>
  );
}

// Paper's Menu.Item wraps a function leadingIcon in a box that stretches to
// the row's height but never centers its own content vertically (only the
// title text gets `justifyContent: 'center'` — see MenuItem.tsx) — a real
// misalignment confirmed live 2026-09-17. Centering here, inside the icon's
// own render, fixes it without touching the library.
function centeredMenuIcon(icon: ReactNode) {
  return () => (
    <View style={styles.menuIconWrap}>{icon}</View>
  );
}

export function TopBarWalletMenu() {
  const { selectedAccount } = useAuthorization();
  const { getExplorerUrl } = useCluster();
  const navigation = useNavigation();
  const [visible, setVisible] = useState(false);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);
  const { disconnect } = useMobileWallet();

  const copyAddressToClipboard = async () => {
    if (selectedAccount) {
      await Clipboard.setStringAsync(selectedAccount.publicKey.toBase58());
    }
    closeMenu();
  };

  const viewExplorer = () => {
    if (selectedAccount) {
      const explorerUrl = getExplorerUrl(
        `account/${selectedAccount.publicKey.toBase58()}`
      );
      Linking.openURL(explorerUrl);
    }
    closeMenu();
  };

  return (
    <Menu
      visible={visible}
      onDismiss={closeMenu}
      anchor={
        <TopBarWalletButton
          selectedAccount={selectedAccount}
          openMenu={openMenu}
        />
      }
    >
      <Menu.Item
        onPress={copyAddressToClipboard}
        title="Copy address"
        leadingIcon={centeredMenuIcon(<FontAwesome6 name="copy" size={16} color={C.textPrimary} />)}
      />
      <Menu.Item
        onPress={viewExplorer}
        title="View Explorer"
        leadingIcon={centeredMenuIcon(
          <FontAwesome6 name="up-right-from-square" size={16} color={C.textPrimary} />,
        )}
      />
      <Menu.Item
        onPress={() => {
          closeMenu();
          navigation.navigate("Settings" as never);
        }}
        title="Network"
        leadingIcon={centeredMenuIcon(<FontAwesome6 name="tower-broadcast" size={16} color={C.textPrimary} />)}
      />
      <Menu.Item
        onPress={async () => {
          await disconnect();
          closeMenu();
        }}
        title="Disconnect"
        leadingIcon={centeredMenuIcon(<FontAwesome6 name="link-slash" size={16} color={C.textPrimary} />)}
      />
    </Menu>
  );
}

const styles = StyleSheet.create({
  walletButton: {
    backgroundColor: C.bgHover,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  connectedDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.positive,
    borderWidth: 1.5,
    borderColor: C.bgElevated,
  },
  menuIconWrap: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
