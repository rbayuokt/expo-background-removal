import {
  Blur,
  Canvas,
  Fill,
  Group,
  ImageShader,
  Paint,
  Shader,
  Shadow,
  useImage,
} from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { dissolveShader } from './dissolve';

export type DisintegrateProps = {
  /** Layer that crumbles away, usually the background plate.
   *  Omit when there is no background to lose, e.g. an already cropped cutout. */
  dustUri?: string;
  /** Layer that survives on top, the cutout subject. Omit to dust the whole image. */
  keepUri?: string;
  width: number;
  height: number;
  /** Drives the dust layer, 0 intact to 1 gone. */
  dust: SharedValue<number>;
  /** Drives the surviving layer, for a second snap that takes the subject too. */
  keepDust: SharedValue<number>;
  /** Bloom that flashes around the silhouette before the plate goes. */
  pulse: SharedValue<number>;
  /** How the layers fill the frame. `cover` bleeds to the edges and crops. */
  fit?: 'contain' | 'cover';
  /** Warm rim light around the cutout. Defaults on. */
  glow?: boolean;
  /** Fires once every layer is decoded. Start the timeline here, not on the promise. */
  onReady?: (info: string) => void;
  style?: StyleProp<ViewStyle>;
};

/** Turns the background into particles and leaves the subject standing. */
export function Disintegrate({
  dustUri,
  keepUri,
  width,
  height,
  dust,
  keepDust,
  pulse,
  fit = 'contain',
  glow = true,
  onReady,
  style,
}: DisintegrateProps) {
  // Skia has no HEIF decoder, so a straight-from-the-camera HEIC never loads. Track the
  // failure instead of waiting forever: the canvas runs with whatever did decode.
  const [dustFailed, setDustFailed] = useState(false);
  const [keepFailed, setKeepFailed] = useState(false);
  const dustImage = useImage(dustUri ?? null, () => setDustFailed(true));
  const keepImage = useImage(keepUri ?? null, () => setKeepFailed(true));

  const ready =
    (dustUri == null || dustImage != null || dustFailed) &&
    (keepUri == null || keepImage != null || keepFailed) &&
    (dustImage != null || keepImage != null);

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const size = (image: typeof dustImage) =>
      image ? `${image.width()}x${image.height()}` : 'none';
    const note = (failed: boolean) => (failed ? ' (decode failed)' : '');
    onReadyRef.current?.(
      `plate ${size(dustImage)}${note(dustFailed)}, cutout ${size(keepImage)}${note(keepFailed)}`
    );
  }, [ready, dustImage, keepImage, dustFailed, keepFailed]);

  // Swelling as it fades reads as a bloom; a fixed blur reads as a static rim.
  const glowBlur = useDerivedValue(() => 6 + 40 * pulse.value + 10 * dust.value, []);
  // The subject swells with its halo and settles back: a pop that does not quite go off.
  const pop = useDerivedValue(() => [{ scale: 1 + 0.045 * pulse.value }], []);
  const glowOpacity = useDerivedValue(
    () => Math.min(1, pulse.value * 0.85 + dust.value * 0.3) * (1 - keepDust.value),
    []
  );

  const dustUniforms = useDerivedValue(
    () => ({ size: [width, height], progress: dust.value }),
    [width, height]
  );
  const keepUniforms = useDerivedValue(
    () => ({ size: [width, height], progress: keepDust.value }),
    [width, height]
  );

  const rect = { x: 0, y: 0, width, height };

  return (
    <View style={[{ width, height }, style]}>
      {/* A shader over a null image paints black, so the photo holds until Skia decodes. */}
      {ready ? null : (
        <Image
          source={{ uri: dustUri ?? keepUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={fit}
        />
      )}
      <Canvas style={StyleSheet.absoluteFill}>
        {dustImage ? (
          <>
            <Group
              layer={
                <Paint>
                  <Blur blur={18} />
                </Paint>
              }>
              <Fill>
                <ImageShader image={dustImage} fit="cover" rect={rect} tx="clamp" ty="clamp" />
              </Fill>
            </Group>

            <Fill>
              <Shader source={dissolveShader} uniforms={dustUniforms}>
                <ImageShader image={dustImage} fit={fit} rect={rect} tx="decal" ty="decal" />
              </Shader>
            </Fill>
          </>
        ) : null}

        {keepImage ? (
          <Group transform={pop} origin={{ x: width / 2, y: height / 2 }}>
            {glow ? (
              // The layer's alpha is the silhouette, so a zero-offset drop shadow traces it.
              // shadowOnly keeps the subject from being drawn twice.
              <Group
                layer={
                  <Paint opacity={glowOpacity}>
                    <Shadow dx={0} dy={0} blur={glowBlur} color="rgb(255,244,224)" shadowOnly />
                  </Paint>
                }>
                <Fill>
                  <Shader source={dissolveShader} uniforms={keepUniforms}>
                    <ImageShader image={keepImage} fit={fit} rect={rect} tx="decal" ty="decal" />
                  </Shader>
                </Fill>
              </Group>
            ) : null}

            <Fill>
              <Shader source={dissolveShader} uniforms={keepUniforms}>
                <ImageShader image={keepImage} fit={fit} rect={rect} tx="decal" ty="decal" />
              </Shader>
            </Fill>
          </Group>
        ) : null}
      </Canvas>
    </View>
  );
}
