import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { TopBar } from "../components/top-bar/top-bar-feature";
import { SwapScreen } from "../screens/SwapScreen";
import { RankScreen } from "../screens/RankScreen";
import { HousesScreen } from "../screens/HousesScreen";
import { ReferralScreen } from "../screens/ReferralScreen";
import { GuideScreen } from "../screens/GuideScreen";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SWAPKINGS_COLORS as C } from "../theme";

const Tab = createBottomTabNavigator();

// Same icon choices as the web app's own NavBar.tsx (FontAwesome
// faRightLeft/faShield/faUsers) — "Friends" is this app's route name for
// ReferralScreen, matching the web app's own /friends label (user's own
// follow-up request, 2026-09-11). Rank has no web equivalent, "trophy" fits
// the LUCK-tier theme. The free FontAwesome6 set only ships these glyphs in
// "solid" (no outline variant), so focus is shown by color, not shape —
// matches how react-navigation already drives tabBarActiveTintColor.
const ICONS: Record<string, string> = {
  Swap: "right-left",
  Houses: "shield",
  Friends: "users",
  Rank: "trophy",
  Guide: "book",
};

/**
 * Main bottom-tab navigator: Houses · Swap · Rank · Friends · Guide.
 */
export function HomeNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <TopBar />,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textSecondary,
        // +10px top/bottom on top of the default bar felt too cramped (user
        // feedback, 2026-09-11); a follow-up trimmed 6px back off the top.
        // height matches paddingTop+paddingBottom so the padding actually
        // adds breathing room instead of squeezing the icon/label.
        tabBarStyle: {
          backgroundColor: C.bgElevated,
          borderTopColor: C.border,
          height: 70,
          paddingTop: 4,
          paddingBottom: 10,
        },
        // Removes the vertical gap between icon and label entirely — even
        // -4 still left a visible gap (user feedback, 2026-09-11).
        tabBarLabelStyle: { marginTop: -8 },
        tabBarIconStyle: { marginBottom: -4 },
        tabBarIcon: ({ color, size }) => (
          <FontAwesome6 name={ICONS[route.name] ?? "circle"} size={size * 0.8} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Houses" component={HousesScreen} />
      <Tab.Screen name="Swap" component={SwapScreen} />
      <Tab.Screen name="Rank" component={RankScreen} />
      <Tab.Screen name="Friends" component={ReferralScreen} />
      <Tab.Screen name="Guide" component={GuideScreen} />
    </Tab.Navigator>
  );
}
