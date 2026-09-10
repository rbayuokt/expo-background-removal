import {
  BackgroundRemovalView,
  extractObjects,
  removeBackground,
  segmentImage,
  toPng,
  type SegmentationResult,
} from '@rbayuokt/expo-background-removal';
import { SubjectReveal, type SubjectRevealHandle } from '@rbayuokt/expo-background-removal/effects';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Checkerboard } from './Checkerboard';
import { color, font } from './theme';

type Specimen = { label: string; uri: string; size?: string };
type CallResult = { files: Specimen[]; reveals: boolean };

const PREVIEW = { maxDimension: 1600 };

export default function App() {
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [ran, setRan] = useState<{ name: string; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cropToSubject, setCropToSubject] = useState(false);
  const [appleLift, setAppleLift] = useState(false);
  const [segmented, setSegmented] = useState<SegmentationResult | null>(null);
  const [open, setOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(440);

  const reveal = useRef<SubjectRevealHandle>(null);
  const slide = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const pending = useRef<{ summary: string; files: Specimen[] } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(hold.current), []);

  useEffect(() => {
    slide.value = withTiming(open ? 1 : 0, { duration: reduceMotion ? 0 : 240 });
  }, [open, reduceMotion, slide]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: slide.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: interpolate(slide.value, [0, 1], [sheetHeight, 0]) }],
  }));

  function resetAll() {
    clearTimeout(hold.current);
    pending.current = null;
    reveal.current?.reset();
    setSegmented(null);
    setSpecimens([]);
    setRan(null);
    setNote(null);
    setFailed(false);
  }

  function say(message: string, isFailure = false) {
    setNote(message);
    setFailed(isFailure);
  }

  function accept(uri: string) {
    clearTimeout(hold.current);
    pending.current = null;
    setOpen(false);
    setSpecimens([]);
    setSegmented(null);
    setRan(null);
    setNote(null);
    setSource(uri);
  }

  async function choosePhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!picked.canceled) {
      accept(picked.assets[0].uri);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      say('Camera access is off. Turn it on in Settings to shoot a photo.', true);
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!shot.canceled) {
      accept(shot.assets[0].uri);
    }
  }

  async function run(name: string, call: () => Promise<CallResult>) {
    if (!source || busy) {
      return;
    }
    clearTimeout(hold.current);
    setOpen(false);
    setBusy(true);
    setSpecimens([]);
    setNote(null);
    const startedAt = Date.now();
    try {
      const { files, reveals } = await call();
      const ms = Date.now() - startedAt;
      console.log(`[timing] ${name}: ${ms}ms`, files);
      setRan({ name, ms });

      const summary = `${name} · ${ms} ms · ${files.length} file${files.length === 1 ? '' : 's'}`;
      if (reveals) {
        // Let the reveal have the screen to itself; the numbers arrive afterwards.
        pending.current = { summary, files };
        setNote(null);
      } else {
        setSpecimens(files);
        say(summary);
      }
    } catch (error) {
      const coded = error as Error & { code?: string };
      say(`${coded.code ?? 'ERROR'}: ${coded.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  const calls = [
    {
      name: 'removeBackground',
      hint: 'the subject, on transparency',
      run: async () => {
        const result = await removeBackground(source!, { cropToSubject, ...PREVIEW });
        // A cropped cutout no longer lines up with a full plate, so it is shown as a
        // specimen only; uncropped it can drive the reveal with the photo behind it.
        setSegmented(
          cropToSubject
            ? null
            : { foregroundUri: result.uri, width: result.width, height: result.height }
        );
        return {
          reveals: !cropToSubject,
          files: [{ label: 'cutout', uri: result.uri, size: `${result.width}×${result.height}` }],
        };
      },
    },
    {
      name: 'segmentImage',
      hint: 'both halves, from one pass',
      run: async () => {
        const result = await segmentImage(source!, PREVIEW);
        setSegmented(result);
        return {
          reveals: true,
          files: [
            {
              label: 'foreground',
              uri: result.foregroundUri,
              size: `${result.width}×${result.height}`,
            },
            ...(result.backgroundUri ? [{ label: 'background', uri: result.backgroundUri }] : []),
          ],
        };
      },
    },
    {
      name: 'extractObjects',
      hint: 'a file for every subject found',
      run: async () => {
        const objects = await extractObjects(source!, PREVIEW);
        return {
          reveals: false,
          files: objects.map((object, index) => ({
            label: `object ${index + 1}`,
            uri: object.uri,
            size: `${object.width}×${object.height}`,
          })),
        };
      },
    },
    {
      name: 'toPng',
      hint: 'decode anything, keep the orientation',
      run: async () => {
        const result = await toPng(source!, PREVIEW);
        return {
          reveals: false,
          files: [{ label: 'png', uri: result.uri, size: `${result.width}×${result.height}` }],
        };
      },
    },
  ];

  return (
    <View style={styles.screen}>
      {source ? (
        // The wall takes its colour from the photo rather than flat paint. Android's
        // blur shreds a full-screen bitmap on some devices, so it keeps the flat wall.
        <>
          {Platform.OS === 'ios' ? (
            <Image
              source={{ uri: source }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={64}
              transition={220}
            />
          ) : null}
          <View style={styles.veil} />
        </>
      ) : null}

      <View style={styles.stage}>
        {source == null ? (
        <View style={styles.empty}>
          <Text style={styles.emptyDisplay}>Lift the subject{'\n'}out of the photograph.</Text>
          <Text style={styles.emptyBody}>
            Runs on the device. Nothing leaves the phone.
          </Text>
          <Text style={styles.emptyPackage}>@rbayuokt/expo-background-removal</Text>
        </View>
      ) : appleLift ? (
        <BackgroundRemovalView
          source={source}
          highlightSubjects
          onSubjects={(event) =>
            say(
              event.nativeEvent.count > 0
                ? `${event.nativeEvent.count} subject${event.nativeEvent.count === 1 ? '' : 's'}. Press and hold one to lift it.`
                : 'VisionKit found no subject in this photo.'
            )
          }
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <SubjectReveal
          ref={reveal}
          key={source}
          source={source}
          autoRun={false}
          busy={busy}
          result={segmented}
          style={StyleSheet.absoluteFill}
          onRevealed={() => {
            const held = pending.current;
            if (!held) {
              return;
            }
            hold.current = setTimeout(() => {
              setSpecimens(held.files);
              say(held.summary);
              pending.current = null;
            }, 100);
          }}
          onError={(error) =>
            say(`${(error as Error & { code?: string }).code ?? 'ERROR'}: ${error.message}`, true)
          }
        />
      )}
      </View>

      <View style={styles.hud} pointerEvents="box-none">
        {note ? (
          <View style={styles.noteChip}>
            <Text style={[styles.note, failed && styles.noteFailed]} numberOfLines={2}>
              {note}
            </Text>
          </View>
        ) : null}

        {specimens.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {specimens.map((file) => (
              <View key={file.uri} style={styles.specimen}>
                <View style={styles.specimenFrame}>
                  <Checkerboard />
                  <Image
                    source={{ uri: file.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                </View>
                <Text style={styles.specimenLabel} numberOfLines={1}>
                  {file.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {source == null ? (
          // Nothing to act on yet, so both sources get the full width.
          <View style={styles.dockStacked}>
            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.pressedCobalt]}
              onPress={choosePhoto}>
              <Text style={styles.primaryLabel}>Choose a photo</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondary, pressed && styles.pressedBone]}
              onPress={takePhoto}>
              <Text style={styles.secondaryLabel}>Take a photo</Text>
            </Pressable>
          </View>
        ) : (
          // With a photo on screen, running a call is the primary action and the two
          // sources shrink to the left.
          <View style={styles.dock}>
            <Pressable
              style={({ pressed }) => [styles.compact, pressed && styles.pressedBone]}
              onPress={choosePhoto}
              disabled={busy}>
              <Text style={styles.secondaryLabel}>Photos</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.compact, pressed && styles.pressedBone]}
              onPress={takePhoto}
              disabled={busy}>
              <Text style={styles.secondaryLabel}>Camera</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primary, styles.grow, pressed && styles.pressedCobalt]}
              onPress={() => setOpen((value) => !value)}
              disabled={busy}>
              <Text style={styles.primaryLabel}>{open ? 'Close' : 'Calls'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {open ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
          <Animated.View style={[styles.scrim, scrimStyle]} />
        </Pressable>
      ) : null}

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        style={[styles.sheet, sheetStyle]}>
        {calls.map((call, index) => (
          <Pressable
            key={call.name}
            disabled={busy}
            onPress={() => run(call.name, call.run)}
            style={({ pressed }) => [
              styles.call,
              index > 0 && styles.ruled,
              pressed && styles.pressedBone,
              busy && styles.dim,
            ]}>
            <View style={styles.callText}>
              <Text style={styles.callName}>{call.name}</Text>
              <Text style={styles.callHint}>{call.hint}</Text>
            </View>
            {ran?.name === call.name ? <Text style={styles.ms}>{ran.ms} ms</Text> : null}
          </Pressable>
        ))}

        <View style={[styles.option, styles.ruled]}>
          <View style={styles.callText}>
            <Text style={styles.callName}>Crop to the subject</Text>
            <Text style={styles.callHint}>Trim the canvas to the subject bounds</Text>
          </View>
          <Switch
            value={cropToSubject}
            onValueChange={setCropToSubject}
            trackColor={{ false: color.rule, true: color.cobalt }}
            thumbColor={color.mat}
          />
        </View>

        <View style={[styles.option, styles.ruled]}>
          <View style={styles.callText}>
            <Text style={styles.callName}>Apple subject lift</Text>
            <Text style={styles.callHint}>VisionKit press and hold, iOS only</Text>
          </View>
          <Switch
            value={appleLift}
            onValueChange={(value) => {
              // Reset first, or switching modes keeps a stale cutout on screen.
              resetAll();
              setAppleLift(value);
              setOpen(false);
            }}
            trackColor={{ false: color.rule, true: color.cobalt }}
            thumbColor={color.mat}
          />
        </View>

        {segmented || specimens.length > 0 ? (
          <Pressable
            onPress={() => {
              resetAll();
              setOpen(false);
            }}
            style={({ pressed }) => [styles.call, styles.ruled, pressed && styles.pressedBone]}>
            <View style={styles.callText}>
              <Text style={styles.resetName}>Reset</Text>
              <Text style={styles.callHint}>Back to the untouched photo</Text>
            </View>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.wall },
  // Inset so the picture centres inside the safe area, while the blurred enlargement
  // behind it runs full bleed.
  stage: { position: 'absolute', top: 58, left: 0, right: 0, bottom: 112 },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(222,227,213,0.26)' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 14 },
  emptyDisplay: {
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 40,
    color: color.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptyBody: { fontFamily: font.sans, fontSize: 13, color: color.inkFaint, textAlign: 'center' },
  emptyPackage: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.inkFaint,
    textAlign: 'center',
    marginTop: 6,
  },

  hud: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 30, gap: 12 },

  noteChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(244,245,238,0.92)',
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  note: { fontFamily: font.mono, fontSize: 11, lineHeight: 15, color: color.ink },
  noteFailed: { color: color.alert },

  strip: { gap: 10, paddingRight: 4 },
  specimen: { width: 88, gap: 5 },
  specimenFrame: {
    height: 110,
    backgroundColor: color.mat,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.rule,
    overflow: 'hidden',
  },
  specimenLabel: {
    fontFamily: font.sans,
    fontSize: 11,
    fontWeight: '600',
    color: color.ink,
    textShadowColor: 'rgba(244,245,238,0.9)',
    textShadowRadius: 3,
  },

  dock: { flexDirection: 'row', gap: 8 },
  dockStacked: { gap: 10 },
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
  dim: { opacity: 0.45 },

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
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule },
  call: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  callText: { flex: 1, gap: 3 },
  callName: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.ink },
  callHint: { fontFamily: font.sans, fontSize: 12.5, color: color.inkFaint },
  ms: { fontFamily: font.mono, fontSize: 11, color: color.cobalt },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  resetName: { fontFamily: font.sans, fontSize: 15, fontWeight: '600', color: color.cobalt },
});
