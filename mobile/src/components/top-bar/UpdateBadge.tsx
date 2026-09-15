import { useState } from "react";
import { StyleSheet } from "react-native";
import { Text, TouchableRipple, ActivityIndicator } from "react-native-paper";
import * as Updates from "expo-updates";

// Visible proof of which OTA update is actually running, plus a manual
// "check now" action — added after a real support cycle where the tester
// couldn't tell whether swiping the app away and reopening it had actually
// picked up a just-published `eas update`, or was still running a stale
// bundle (2026-09-11). Updates.updateId/createdAt reflect the update that's
// ACTUALLY loaded right now, not what was merely published — the only
// trustworthy signal here.
export function UpdateBadge() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const label = Updates.isEmbeddedLaunch
    ? "build (no OTA)"
    : `upd ${(Updates.updateId ?? "").slice(0, 8)}`;

  const onPress = async () => {
    setChecking(true);
    setStatus("Checking…");
    try {
      // NOT checkForUpdateAsync() + "only fetch/reload if isAvailable" — a
      // real bug, confirmed live 2026-09-11: expo-updates' own background
      // check (runs automatically on launch) can already have DOWNLOADED
      // the latest update without ever APPLYING it (that only happens on
      // reload). checkForUpdateAsync() then correctly reports "nothing new
      // to fetch" — because there genuinely isn't — while the screen is
      // still running the older, already-launched JS. The badge showed "Up
      // to date" and the UI stayed stale. fetchUpdateAsync() is a no-op when
      // there's truly nothing newer, so it's always safe to call, and
      // reloadAsync() afterwards actually SWITCHES to whatever the latest
      // fetched bundle is — whether it was just fetched or sitting there
      // from an earlier background check.
      await Updates.fetchUpdateAsync();
      setStatus("Restarting…");
      await Updates.reloadAsync();
      // reloadAsync tears the app down — nothing after this line runs.
    } catch (err) {
      setStatus(err instanceof Error ? err.message.slice(0, 40) : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <TouchableRipple onPress={onPress} disabled={checking} style={styles.wrap}>
      <>
        {checking ? <ActivityIndicator size={10} style={styles.spinner} /> : null}
        <Text variant="labelSmall" style={styles.text}>
          {status ?? label}
        </Text>
      </>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  spinner: {
    marginRight: 4,
  },
  text: {
    opacity: 0.6,
  },
});
