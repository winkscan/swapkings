import { MD3DarkTheme } from "react-native-paper";

// SwapKings' real brand palette, pulled straight from swapkings.app's own
// src/index.css (:root custom properties) — the mobile app was running on
// react-native-paper's generic Material-You purple default until now, which
// looked nothing like the actual brand (dark near-black + yellow accent).
// The web app has no light variant at all, so the mobile app doesn't either
// — always this dark theme, regardless of the device's system setting.
export const SWAPKINGS_COLORS = {
  bg: "#090d10",
  bgElevated: "#12161c",
  bgInput: "#171b22",
  bgHover: "#1c212a",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  textPrimary: "#f5f6f8",
  textSecondary: "#8992a6",
  textTertiary: "#5b6376",
  accent: "#FFEF46",
  accentHover: "#fff573",
  accentTextOn: "#0b1006",
  positive: "#B5FF46",
  negative: "#f6685a",
};

const c = SWAPKINGS_COLORS;

export const swapKingsTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: c.accent,
    onPrimary: c.accentTextOn,
    primaryContainer: "#2b2a12",
    onPrimaryContainer: c.accent,
    secondary: c.positive,
    onSecondary: c.accentTextOn,
    secondaryContainer: "#1c2a12",
    onSecondaryContainer: c.positive,
    background: c.bg,
    onBackground: c.textPrimary,
    surface: c.bgElevated,
    onSurface: c.textPrimary,
    surfaceVariant: c.bgInput,
    onSurfaceVariant: c.textSecondary,
    outline: c.borderStrong,
    outlineVariant: c.border,
    error: c.negative,
    onError: "#ffffff",
    elevation: {
      level0: "transparent",
      level1: c.bgElevated,
      level2: c.bgInput,
      level3: c.bgHover,
      level4: c.bgHover,
      level5: c.bgHover,
    },
  },
};
