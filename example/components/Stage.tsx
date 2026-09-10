import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme';

/** The picture area. What goes in it is the caller's business. */
export function Stage({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.stage}>
      {children ?? (
        <View style={styles.empty}>
          <Text style={styles.display}>Lift the subject{'\n'}out of the photograph.</Text>
          <Text style={styles.body}>Runs on the device. Nothing leaves the phone.</Text>
          <Text style={styles.packageName}>@rbayuokt/expo-background-removal</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inset so the picture centres inside the safe area, while the blurred enlargement
  // behind it runs full bleed.
  stage: { position: 'absolute', top: 58, left: 0, right: 0, bottom: 112 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 14 },
  display: {
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 40,
    color: color.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: { fontFamily: font.sans, fontSize: 13, color: color.inkFaint, textAlign: 'center' },
  packageName: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.inkFaint,
    textAlign: 'center',
    marginTop: 6,
  },
});
