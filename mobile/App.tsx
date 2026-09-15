// Polyfills
import "./src/polyfills";

import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { swapKingsTheme, SWAPKINGS_COLORS } from "./src/theme";

const queryClient = new QueryClient();

// Always the SwapKings dark theme, regardless of the device's system
// setting — swapkings.app itself has no light variant, so neither does this
// app. See src/theme.ts for the real brand palette (pulled from the web
// app's own CSS) this replaces react-native-paper's generic purple default.
const { DarkTheme: NavTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDarkTheme,
  reactNavigationDark: NavigationDarkTheme,
});
const combinedNavTheme = {
  ...NavTheme,
  colors: {
    ...NavTheme.colors,
    ...swapKingsTheme.colors,
    card: SWAPKINGS_COLORS.bgElevated,
    background: SWAPKINGS_COLORS.bg,
    text: SWAPKINGS_COLORS.textPrimary,
    border: SWAPKINGS_COLORS.border,
  },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "processed" }}>
          <SafeAreaView style={[styles.shell, { backgroundColor: SWAPKINGS_COLORS.bg }]}>
            <PaperProvider theme={swapKingsTheme}>
              <AppNavigator navTheme={combinedNavTheme} />
            </PaperProvider>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
