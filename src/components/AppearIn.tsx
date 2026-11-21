import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';

/** The step between two cards' entrances, and the cap so a long list does not keep the last cards waiting. */
export const APPEAR_STEP_MS = 70;
export const APPEAR_MAX_STEPS = 6;

/**
 * vc23 (Lumen L3): a card fades in and rises 8 px when it first mounts, one after the other by `index`.
 * With the system's reduce-motion setting on, it shows at once. Built on RN Animated: no new dependency.
 */
export function AppearIn({ index, children }: { index: number; children: React.ReactNode }) {
  // A state initialiser, not a ref: the React compiler rule forbids reading refs during render.
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduceMotion(on); })
      .catch(() => { if (alive) setReduceMotion(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      delay: Math.min(index, APPEAR_MAX_STEPS) * APPEAR_STEP_MS,
      // The native driver does not exist on web; there it would only warn.
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [reduceMotion, index, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }] }} testID="appear-in">
      {children}
    </Animated.View>
  );
}
