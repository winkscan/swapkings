import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, TouchableRipple } from 'react-native-paper'
import { SWAPKINGS_COLORS as C } from '../theme'

// Same look as swapkings.app's own `.pill-tabs` (index.css): active tab =
// bgHover background + accent (yellow) text — not react-native-paper's
// SegmentedButtons default, which pulled the theme's `secondary` (green)
// for the active segment and didn't match at all (user feedback,
// 2026-09-11). `fullWidth` stretches the group edge-to-edge with equal-width
// segments (matches the original SegmentedButtons layout the user wanted
// back) instead of a content-sized, centered pill group.
export function PillTabs<T extends string>({
  value,
  onChange,
  options,
  fullWidth = false,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  fullWidth?: boolean
}) {
  return (
    <View style={[styles.container, fullWidth && styles.containerFullWidth]}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <TouchableRipple
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.tab, fullWidth && styles.tabFullWidth, active && styles.tabActive]}
            borderless
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{o.label}</Text>
          </TouchableRipple>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: C.bgElevated,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    alignSelf: 'center',
  },
  containerFullWidth: { alignSelf: 'stretch' },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  tabFullWidth: { flex: 1, alignItems: 'center' },
  tabActive: { backgroundColor: C.bgHover },
  tabText: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: C.accent },
})
