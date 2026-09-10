import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { runOnJS, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Disintegrate } from './Disintegrate';
import { Scanner } from './Scanner';
import type { SegmentationResult } from '../ExpoBackgroundRemoval.types';
import { segmentImage, toPng } from '../index';

export type SubjectRevealProps = {
  /** Local image URI. Any format the OS can decode, including HEIC. */
  source: string;
  /**
   * A result to reveal instead of segmenting again. Pass the output of `segmentImage()`,
   * or a `removeBackground()` cutout as `{ foregroundUri, width, height }` and the source
   * stands in as the plate.
   */
  result?: SegmentationResult | null;
  /** Longest edge used for segmentation and for the on-screen layers. */
  maxDimension?: number;
  /** Segment as soon as `source` is set. Set false to wait for `run()`. Defaults to true. */
  autoRun?: boolean;
  /** Play the reveal as soon as the layers are decoded. Defaults to true. */
  autoPlay?: boolean;
  /** Dissolve length in ms. Defaults to 2600. */
  duration?: number;
  /** How the picture fills the frame. `cover` bleeds to the edges and crops. */
  fit?: 'contain' | 'cover';
  /** Warm bloom around the subject. Defaults to true. */
  glow?: boolean;
  onReady?: (result: SegmentationResult) => void;
  /** Fires when the background has finished crumbling. */
  onRevealed?: () => void;
  onError?: (error: Error) => void;
  style?: StyleProp<ViewStyle>;
};

export type SubjectRevealHandle = {
  /** Segment the current source. Only needed when `autoRun` is false. */
  run: () => void;
  /** Blow the background away. */
  play: () => void;
  /** Take the subject too. */
  snap: () => void;
  /** Put everything back. */
  reset: () => void;
};

/**
 * Normalises the photo, segments it, sweeps a scan while that runs, then blooms the
 * subject and turns the background into particles.
 *
 * Needs `@shopify/react-native-skia` and `react-native-reanimated`, both optional peers.
 */
export const SubjectReveal = forwardRef<SubjectRevealHandle, SubjectRevealProps>(
  function SubjectReveal(
    {
      source,
      result: providedResult,
      maxDimension = 1600,
      autoRun = true,
      autoPlay = true,
      duration = 2600,
      fit = 'contain',
      glow = true,
      onReady,
      onRevealed,
      onError,
      style,
    },
    ref
  ) {
    const onRevealedRef = useRef(onRevealed);
    useEffect(() => {
      onRevealedRef.current = onRevealed;
    }, [onRevealed]);

    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    /** A Skia-readable copy of the source. Depends on `source` alone, so it is never
     *  swapped in halfway through a reveal. */
    const [plate, setPlate] = useState<string | null>(null);
    const [ownResult, setOwnResult] = useState<SegmentationResult | null>(null);
    const [working, setWorking] = useState(false);
    const [runId, setRunId] = useState(0);

    const result = providedResult ?? ownResult;

    const bgDust = useSharedValue(0);
    const fgDust = useSharedValue(0);
    const pulse = useSharedValue(0);

    const reset = useCallback(() => {
      bgDust.value = 0;
      fgDust.value = 0;
      pulse.value = 0;
    }, [bgDust, fgDust, pulse]);

    const revealed = useCallback(() => onRevealedRef.current?.(), []);

    const play = useCallback(() => {
      pulse.value = withSequence(
        withTiming(1, { duration: 320 }),
        withTiming(0, { duration: 520 })
      );
      bgDust.value = withDelay(
        260,
        withTiming(1, { duration }, (finished) => {
          'worklet';
          if (finished) {
            runOnJS(revealed)();
          }
        })
      );
    }, [bgDust, duration, pulse, revealed]);

    const snap = useCallback(() => {
      bgDust.value = withTiming(1, { duration: duration / 2 });
      fgDust.value = withTiming(1, { duration });
    }, [bgDust, duration, fgDust]);

    // The picker hands back whatever the library holds, often HEIC, which Skia cannot
    // decode. One normalise per source keeps every layer downstream loadable.
    useEffect(() => {
      let cancelled = false;
      reset();
      setPlate(null);
      setOwnResult(null);
      setWorking(false);

      toPng(source, { maxDimension })
        .then((normalised) => {
          if (!cancelled) {
            setPlate(normalised.uri);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            onError?.(error as Error);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [source, maxDimension]);

    const segment = useCallback(async () => {
      if (!plate) {
        return;
      }
      setWorking(true);
      try {
        const segmented = await segmentImage(plate, { maxDimension });
        reset();
        setOwnResult(segmented);
        setRunId((id) => id + 1);
        onReady?.(segmented);
      } catch (error) {
        onError?.(error as Error);
      } finally {
        setWorking(false);
      }
    }, [plate, maxDimension]);

    // Autorun waits for the plate, so the canvas never mounts without one.
    useEffect(() => {
      if (autoRun && plate && !providedResult && !ownResult) {
        segment();
      }
    }, [autoRun, plate]);

    useEffect(() => {
      if (providedResult) {
        reset();
        setRunId((id) => id + 1);
      }
    }, [providedResult]);

    useImperativeHandle(ref, () => ({ run: segment, play, snap, reset }), [
      segment,
      play,
      snap,
      reset,
    ]);

    const onLayout = (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height }
      );
    };

    // Hold the reveal until both the plate and a result exist, so no layer appears
    // mid-animation.
    const revealing = result != null && plate != null;

    return (
      <View style={style} onLayout={onLayout}>
        {size == null ? null : revealing ? (
          <Disintegrate
            key={runId}
            dustUri={result.backgroundUri ?? plate}
            keepUri={result.foregroundUri}
            width={size.width}
            height={size.height}
            dust={bgDust}
            keepDust={fgDust}
            pulse={pulse}
            fit={fit}
            glow={glow}
            onReady={autoPlay ? play : undefined}
          />
        ) : working ? (
          <Scanner uri={plate ?? source} width={size.width} height={size.height} fit={fit} />
        ) : (
          <Image
            source={{ uri: plate ?? source }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        )}
      </View>
    );
  }
);
