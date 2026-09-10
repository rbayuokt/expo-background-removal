import { Canvas, Fill, ImageShader, Shader, useImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { scanShader } from './dissolve';

export type ScannerProps = {
  uri: string;
  width: number;
  height: number;
  fit?: 'contain' | 'cover';
  style?: StyleProp<ViewStyle>;
};

/** The waiting state: a light sweep across the photo while native work runs. */
export function Scanner({ uri, width, height, fit = 'contain', style }: ScannerProps) {
  const image = useImage(uri);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const uniforms = useDerivedValue(
    () => ({ size: [width, height], progress: progress.value }),
    [width, height]
  );

  return (
    <View style={[{ width, height }, style]}>
      {/* A shader over a null image paints black, so the photo holds until Skia decodes. */}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={fit} />
      {image ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={scanShader} uniforms={uniforms}>
              <ImageShader
                image={image}
                fit={fit}
                rect={{ x: 0, y: 0, width, height }}
                tx="decal"
                ty="decal"
              />
            </Shader>
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}
