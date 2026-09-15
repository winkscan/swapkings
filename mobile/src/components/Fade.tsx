import React, { useEffect, useRef } from 'react'
import { Animated, type StyleProp, type ViewStyle } from 'react-native'

// Fades its content in on mount — pair with a `key` prop that changes when
// the content changes (e.g. `<Fade key={tab}>`) to turn an abrupt content
// swap (like PillTabs switching sections) into a smooth crossfade instead
// of an instant jump (user feedback, 2026-09-15).
export function Fade({
  children,
  duration = 180,
  style,
}: {
  children: React.ReactNode
  duration?: number
  style?: StyleProp<ViewStyle>
}) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start()
  }, [duration, opacity])

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>
}
