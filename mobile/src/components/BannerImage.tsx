import React, { useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { SWAPKINGS_COLORS as C } from '../theme'

// Wide token banner (DexScreener's per-mint header image) — not every token
// has one, so this collapses to a plain dark rectangle instead of a broken
// image when it 404s, keeping the card's layout stable either way.
export function BannerImage({
  mint,
  url,
  height,
}: {
  mint: string
  url: string
  height: number
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [mint, url])

  if (failed) {
    return <View style={[styles.placeholder, { height }]} />
  }
  return (
    <Image
      source={{ uri: url }}
      style={[styles.image, { height }]}
      onError={() => setFailed(true)}
    />
  )
}

const styles = StyleSheet.create({
  image: { width: '100%', backgroundColor: C.bgInput },
  placeholder: { width: '100%', backgroundColor: C.bgInput },
})
