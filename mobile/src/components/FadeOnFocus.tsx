import React, { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

// Bottom-tab screens swap instantly by default (react-navigation's
// BottomTabView has no built-in transition) — felt jerky switching between
// Swap/Houses/Rank/Friends/Guide (user feedback, 2026-09-15). This fades a
// screen's content in/out on focus change without unmounting it, so state
// (scroll position, in-flight fetches, form input) survives a tab switch —
// unlike remounting, which would reset all of that every time.
export function FadeOnFocus({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused()
  const opacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isFocused ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [isFocused, opacity])

  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>
}
