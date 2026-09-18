// Polyfills
import "./src/polyfills";

import { useCallback } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { swapKingsTheme, SWAPKINGS_COLORS } from "./src/theme";

const queryClient = new QueryClient();

// Keeps the native splash (see app.json's expo-splash-screen plugin config)
// up until the JS side has actually painted its first (dark) frame, instead
// of the default auto-hide-on-bridge-ready behavior — that gap left a plain
// white Android window background briefly visible between the splash
// disappearing and this app's own dark root view mounting (confirmed live
// 2026-09-18, right after switching the splash image off Expo's default).
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  // Only hides the splash once this dark root view has actually committed
  // its first layout — by then the native window background is already
  // covered by our own content, so there's nothing white left to flash.
  const onRootLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "processed" }}>
          <SafeAreaView
            style={[styles.shell, { backgroundColor: SWAPKINGS_COLORS.bg }]}
            onLayout={onRootLayout}
          >
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
