import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { color, font } from '../theme';
import type { Call } from '../types';

type Props = {
  open: boolean;
  calls: Call[];
  busy: boolean;
  ran: { name: string; ms: number } | null;
  cropToSubject: boolean;
  appleLift: boolean;
  canReset: boolean;
  onClose: () => void;
  onRun: (call: Call) => void;
  onCropToSubject: (value: boolean) => void;
  onAppleLift: (value: boolean) => void;
  onReset: () => void;
};

export function CallSheet({
  open,
  calls,
  busy,
  ran,
  cropToSubject,
  appleLift,
  canReset,
  onClose,
  onRun,
  onCropToSubject,
  onAppleLift,
  onReset,
}: Props) {
  const [height, setHeight] = useState(440);
  const slide = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    slide.value = withTiming(open ? 1 : 0, { duration: reduceMotion ? 0 : 240 });
  }, [open, reduceMotion, slide]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: slide.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: interpolate(slide.value, [0, 1], [height, 0]) }],
  }));

  return (
    <>
      {open ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.scrim, scrimStyle]} />
        </Pressable>
      ) : null}

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={[styles.sheet, sheetStyle]}>
        {calls.map((call, index) => (
          <Pressable
            key={call.name}
            disabled={busy}
            onPress={() => onRun(call)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.ruled,
              pressed && styles.pressed,
              busy && styles.dim,
            ]}>
            <View style={styles.text}>
              <Text style={styles.name}>{call.name}</Text>
              <Text style={styles.hint}>{call.hint}</Text>
            </View>
            {ran?.name === call.name ? <Text style={styles.ms}>{ran.ms} ms</Text> : null}
          </Pressable>
        ))}

        <Option
          name="Crop to the subject"
          hint="Trim the canvas to the subject bounds"
          value={cropToSubject}
          onChange={onCropToSubject}
        />
        <Option
          name="Apple subject lift"
          hint="VisionKit press and hold, iOS only"
          value={appleLift}
          onChange={onAppleLift}
        />

        {canReset ? (
          <Pressable
            onPress={onReset}
            style={({ pressed }) => [styles.row, styles.ruled, pressed && styles.pressed]}>
            <View style={styles.text}>
              <Text style={styles.reset}>Reset</Text>
              <Text style={styles.hint}>Back to the untouched photo</Text>
            </View>
          </Pressable>
        ) : null}
      </Animated.View>
    </>
  );
}

function Option({
  name,
  hint,
  value,
  onChange,
}: {
  name: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.row, styles.ruled]}>
      <View style={styles.text}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.rule, true: color.cobalt }}
        thumbColor={color.mat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(30,35,27,0.42)' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 100,
    backgroundColor: color.mat,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
    overflow: 'hidden',
    shadowColor: '#1E231B',
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule },
  pressed: { backgroundColor: color.wallDeep },
  dim: { opacity: 0.45 },
  text: { flex: 1, gap: 3 },
  name: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.ink },
  hint: { fontFamily: font.sans, fontSize: 12.5, color: color.inkFaint },
  ms: { fontFamily: font.mono, fontSize: 11, color: color.cobalt },
  reset: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.cobalt },
});
