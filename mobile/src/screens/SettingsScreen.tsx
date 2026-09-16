import { StyleSheet, View } from "react-native";
import { List, Text } from "react-native-paper";
import { useCluster } from "../components/cluster/cluster-data-access";

// Static — SwapKings is mainnet-only, so there is nothing to switch to. This
// used to be a devnet/testnet/mainnet RadioButton picker inherited from the
// Expo template; see cluster-data-access.tsx's own comment for the real bug
// that removing it fixed (tapping the mainnet row there would crash the app).
export function SettingsScreen() {
  const { selectedCluster } = useCluster();
  return (
    <View style={styles.screenContainer}>
      <Text variant="headlineMedium" style={styles.title}>
        Network
      </Text>
      <List.Item title={selectedCluster.name} description={selectedCluster.endpoint} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    height: "100%",
    padding: 20,
    flex: 1,
  },
  title: {
    marginBottom: 8,
  },
});
