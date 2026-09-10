import {
  BackgroundRemovalView,
  extractObjects,
  removeBackground,
  segmentImage,
  toPng,
  type SegmentationResult,
} from '@rbayuokt/expo-background-removal';
import {
  SubjectReveal,
  type SubjectRevealHandle,
} from '@rbayuokt/expo-background-removal/effects';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { CallSheet } from './components/CallSheet';
import { Dock } from './components/Dock';
import { Filmstrip } from './components/Filmstrip';
import { Stage } from './components/Stage';
import { StatusNote } from './components/StatusNote';
import { color } from './theme';
import type { Call, Specimen } from './types';

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

  const reveal = useRef<SubjectRevealHandle>(null);
  const pending = useRef<{ summary: string; files: Specimen[] } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(hold.current), []);

  function say(message: string, isFailure = false) {
    setNote(message);
    setFailed(isFailure);
  }

  function clearResults() {
    clearTimeout(hold.current);
    pending.current = null;
    setSpecimens([]);
    setSegmented(null);
    setRan(null);
    setNote(null);
    setFailed(false);
  }

  function resetAll() {
    reveal.current?.reset();
    clearResults();
  }

  function accept(uri: string) {
    setOpen(false);
    clearResults();
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

  async function run(call: Call) {
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
      const { files, reveals } = await call.run();
      const ms = Date.now() - startedAt;
      console.log(`[timing] ${call.name}: ${ms}ms`, files);
      setRan({ name: call.name, ms });

      const summary = `${call.name} · ${ms} ms · ${files.length} file${files.length === 1 ? '' : 's'}`;
      if (reveals) {
        pending.current = { summary, files };
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

  function releasePending() {
    const held = pending.current;
    if (!held) {
      return;
    }
    hold.current = setTimeout(() => {
      setSpecimens(held.files);
      say(held.summary);
      pending.current = null;
    }, 100);
  }

  const calls: Call[] = source == null ? [] : [
    {
      name: 'removeBackground',
      hint: 'the subject, on transparency',
      run: async () => {
        const result = await removeBackground(source, { cropToSubject, ...PREVIEW });
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
        const result = await segmentImage(source, PREVIEW);
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
        const objects = await extractObjects(source, PREVIEW);
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
        const result = await toPng(source, PREVIEW);
        return {
          reveals: false,
          files: [{ label: 'png', uri: result.uri, size: `${result.width}×${result.height}` }],
        };
      },
    },
  ];

  return (
    <View style={styles.screen}>
      {source && Platform.OS === 'ios' ? (
        <>
          <Image
            source={{ uri: source }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={64}
            transition={220}
          />
          <View style={styles.veil} />
        </>
      ) : null}

      <Stage>
        {source == null ? null : appleLift ? (
          <BackgroundRemovalView
            source={source}
            highlightSubjects
            onSubjects={(event) => {
              const { count } = event.nativeEvent;
              say(
                count > 0
                  ? `${count} subject${count === 1 ? '' : 's'}. Press and hold one to lift it.`
                  : 'VisionKit found no subject in this photo.'
              );
            }}
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
            onRevealed={releasePending}
            onError={(error) =>
              say(`${(error as Error & { code?: string }).code ?? 'ERROR'}: ${error.message}`, true)
            }
          />
        )}
      </Stage>

      <View style={styles.hud} pointerEvents="box-none">
        <StatusNote note={note} failed={failed} />
        <Filmstrip specimens={specimens} />
        <Dock
          hasPhoto={source != null}
          busy={busy}
          open={open}
          onPhotos={choosePhoto}
          onCamera={takePhoto}
          onToggleCalls={() => setOpen((value) => !value)}
        />
      </View>

      <CallSheet
        open={open}
        calls={calls}
        busy={busy}
        ran={ran}
        cropToSubject={cropToSubject}
        appleLift={appleLift}
        canReset={segmented != null || specimens.length > 0}
        onClose={() => setOpen(false)}
        onRun={run}
        onCropToSubject={setCropToSubject}
        onAppleLift={(value) => {
          resetAll();
          setAppleLift(value);
          setOpen(false);
        }}
        onReset={() => {
          resetAll();
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.wall },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(222,227,213,0.26)' },
  hud: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 30, gap: 12 },
});
