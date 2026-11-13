import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/** The widest the app's content gets in a browser (a laptop showed a 1192 px wide button, 2026-11-13). */
export const WEB_MAX_CONTENT_WIDTH = 960;

// On the web the screens sit in a centred column; on a phone this is a plain pass-through.
export function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.outer}>
      <View style={styles.column} testID="web-frame">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#f5f5f5' },
  column: { flex: 1, width: '100%', maxWidth: WEB_MAX_CONTENT_WIDTH, alignSelf: 'center' },
});
