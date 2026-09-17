import React, { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, Image, Pressable, StyleSheet, View } from 'react-native'
import { Button, Checkbox, Portal, Text, TouchableRipple } from 'react-native-paper'
import { BlurView } from 'expo-blur'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation } from '@react-navigation/native'
import { SWAPKINGS_COLORS as C } from '../theme'

const DISMISSED_KEY = 'swapkings.onboardingDismissed.v1'

// Explicit pixel height instead of the `aspectRatio` style — confirmed live
// 2026-09-18 that Image + aspectRatio silently ignored the container's
// resolved width on-device and fell back to the webp's own native pixel
// size instead (over 1000px tall), pushing the whole card's body content
// off the bottom of the screen. Computed the same way the panel-width
// constants elsewhere in this app are (e.g. SwapScreen.tsx's own
// TOKEN_MENU_WIDTH) — app is portrait-locked, so this is stable.
const CARD_WIDTH = Dimensions.get('window').width - 40
const IMAGE_HEIGHT = Math.round((CARD_WIDTH * 9) / 16)

// Same copy/images/flow as the web app's own OnboardingModal.tsx — shown
// once per fresh app open unless "Don't show this again" is checked.
// Mounted once at the navigation root (AppNavigator.tsx) so it appears
// regardless of which tab a new user lands on first, matching the web
// version's own App-level mount.
const STEPS = [
  {
    image: require('../../assets/onboarding/onboarding-problem.webp'),
    title: 'Founders earn nothing outside their own coin',
    body: "On every other launchpad, a token's founder only ever earns when someone trades that exact coin. Everywhere else on-chain — every other swap, every other coin — the king gets nothing, no matter how loyal his people are.",
  },
  {
    image: require('../../assets/onboarding/onboarding-solution.webp'),
    title: 'Every swap can pay tribute to your king',
    body: 'Join a crew, and a share of your platform fee flows to that founder on every swap you make — any coins, any direction, not just theirs. A whole kingdom of trades becomes real, ongoing revenue for the founder you believe in.',
  },
] as const

export function OnboardingModal() {
  const navigation = useNavigation()
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setVisible(v !== '1'))
      .catch(() => setVisible(true))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (visible) {
      opacity.setValue(0)
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    }
  }, [visible, opacity])

  if (!ready || !visible) return null

  const close = () => {
    if (dontShowAgain) {
      AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {})
    }
    setVisible(false)
  }

  const isLastStep = step === STEPS.length - 1
  const current = STEPS[step]

  const handlePrimary = () => {
    if (isLastStep) {
      close()
      // "Crews" is nested inside HomeStack's own tab navigator, not a
      // top-level Stack.Screen — same nested-navigate shape react-navigation
      // needs for any tab reached from outside HomeNavigator itself. `any`
      // here since useNavigation()'s un-parameterized type has no overload
      // for a nested {screen} target (same escape hatch already used
      // elsewhere in this codebase for cross-navigator navigation).
      ;(navigation as any).navigate('HomeStack', { screen: 'Crews' })
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <Portal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <BlurView
          intensity={45}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.positioner} pointerEvents="box-none">
          <View style={styles.card}>
            <Pressable style={styles.closeBtn} onPress={close}>
              <FontAwesome6 name="xmark" size={14} color="#fff" />
            </Pressable>
            <Image source={current.image} style={styles.image} resizeMode="cover" />
            <View style={styles.body}>
              <View style={styles.progressRow}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[styles.progressSeg, i <= step && styles.progressSegActive]} />
                ))}
              </View>

              <Text style={styles.title}>{current.title}</Text>
              <Text style={styles.description}>{current.body}</Text>

              <TouchableRipple onPress={() => setDontShowAgain((v) => !v)} style={styles.checkboxRow}>
                <View style={styles.checkboxRowInner} pointerEvents="none">
                  <Checkbox status={dontShowAgain ? 'checked' : 'unchecked'} color={C.accent} />
                  <Text style={styles.checkboxLabel}>Don&apos;t show this again</Text>
                </View>
              </TouchableRipple>

              <View style={styles.actionsRow}>
                <Button mode="text" textColor={C.textSecondary} onPress={close}>
                  Skip
                </Button>
                <Button
                  mode="contained"
                  buttonColor={C.accent}
                  textColor={C.accentTextOn}
                  style={styles.primaryBtn}
                  onPress={handlePrimary}
                  icon={({ size, color }) =>
                    isLastStep ? (
                      <FontAwesome6 name="people-group" size={size * 0.85} color={color} />
                    ) : (
                      <FontAwesome6 name="arrow-right" size={size * 0.75} color={color} />
                    )
                  }
                >
                  {isLastStep ? 'Join Crew' : 'Next'}
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </Portal>
  )
}

const styles = StyleSheet.create({
  positioner: { flex: 1, justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 20 },
  card: {
    backgroundColor: C.bgElevated,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  image: { width: '100%', height: IMAGE_HEIGHT },
  body: { padding: 20 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.bgInput },
  progressSegActive: { backgroundColor: C.accent },
  title: { color: C.textPrimary, fontWeight: '700', fontSize: 18, marginBottom: 8 },
  description: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  checkboxRow: { marginLeft: -12, marginBottom: 4, borderRadius: 8 },
  checkboxRowInner: { flexDirection: 'row', alignItems: 'center' },
  checkboxLabel: { color: C.textSecondary, fontSize: 12 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  primaryBtn: { borderRadius: 16 },
})
