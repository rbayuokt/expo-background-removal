import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme';

type Props = {
  hasPhoto: boolean;
  busy: boolean;
  open: boolean;
  onPhotos: () => void;
  onCamera: () => void;
  onToggleCalls: () => void;
};

export function Dock({ hasPhoto, busy, open, onPhotos, onCamera, onToggleCalls }: Props) {
  if (!hasPhoto) {
    // Nothing to act on yet, so both sources get the full width.
    return (
      <View style={styles.stacked}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressedCobalt]}
          onPress={onPhotos}>
          <Text style={styles.primaryLabel}>Choose a photo</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressedBone]}
          onPress={onCamera}>
          <Text style={styles.secondaryLabel}>Take a photo</Text>
        </Pressable>
      </View>
    );
  }

  // With a photo on screen, running a call is the primary action and the two sources
  // shrink to the left.
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.compact, pressed && styles.pressedBone]}
        onPress={onPhotos}
        disabled={busy}>
        <Text style={styles.secondaryLabel}>Photos</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.compact, pressed && styles.pressedBone]}
        onPress={onCamera}
        disabled={busy}>
        <Text style={styles.secondaryLabel}>Camera</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.primary, styles.grow, pressed && styles.pressedCobalt]}
        onPress={onToggleCalls}
        disabled={busy}>
        <Text style={styles.primaryLabel}>{open ? 'Close' : 'Calls'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  stacked: { gap: 10 },
  grow: { flex: 1 },
  primary: {
    backgroundColor: color.cobalt,
    borderRadius: 3,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.mat },
  secondary: {
    backgroundColor: color.mat,
    borderRadius: 3,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
  },
  compact: {
    backgroundColor: color.mat,
    borderRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
  },
  secondaryLabel: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.ink },
  pressedCobalt: { backgroundColor: color.cobaltDeep },
  pressedBone: { backgroundColor: color.wallDeep },
});
