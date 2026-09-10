import { Skia } from '@shopify/react-native-skia';

/**
 * A front sweeps down the plate, dropping each 2px grain at its own random moment, so the
 * image breaks into speckle instead of fading as a sheet.
 */
export const dissolveShader = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 size;
uniform float progress;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

half4 main(float2 xy) {
  float2 uv = xy / size;
  float grain = hash(floor(xy / 2.0));

  float age = clamp(progress * 2.4 - uv.y * 1.0 - 0.2, 0.0, 1.0);
  if (age <= 0.0) {
    return image.eval(xy);
  }

  float alive = step(age, grain);
  float2 drift = float2((grain - 0.5) * 12.0, -22.0 * (0.4 + grain)) * age;
  float glint = 1.0 + 0.4 * (1.0 - age);

  return image.eval(xy - drift) * alive * glint;
}
`)!;

/** A sheen that keeps sweeping the plate while native work is in flight. */
export const scanShader = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 size;
uniform float progress;

half4 main(float2 xy) {
  float2 uv = xy / size;
  half4 color = image.eval(xy);

  float band = uv.x * 0.65 + uv.y * 0.35;
  float d = band - (progress * 1.6 - 0.3);
  float sheen = exp(-(d * d) / 0.0022);

  return color * 0.72 + color * sheen * 1.5 + half4(sheen * 0.18);
}
`)!;
