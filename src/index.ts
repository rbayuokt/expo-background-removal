// Re-export the native module. On web, it will be resolved to ExpoBackgroundRemovalModule.web.ts
// and on native platforms to ExpoBackgroundRemovalModule.ts
import type {
  ExtractedObject,
  ProcessOptions,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  SegmentationResult,
} from './ExpoBackgroundRemoval.types';
import ExpoBackgroundRemovalModule from './ExpoBackgroundRemovalModule';

export { default } from './ExpoBackgroundRemovalModule';
export * from './ExpoBackgroundRemoval.types';
export * from './ExpoBackgroundRemovalView';

/** Detects the foreground subjects and writes a transparent PNG into the cache directory. */
export async function removeBackground(
  uri: string,
  options: RemoveBackgroundOptions = {}
): Promise<RemoveBackgroundResult> {
  return ExpoBackgroundRemovalModule.removeBackground(uri, options);
}

/**
 * Decodes any supported format, normalises the EXIF orientation and writes a PNG.
 * Skia has no HEIF decoder, so an iPhone photo needs this before it can be drawn there.
 */
export async function toPng(
  uri: string,
  options: ProcessOptions = {}
): Promise<RemoveBackgroundResult> {
  return ExpoBackgroundRemovalModule.toPng(uri, options);
}

/** Splits an image into a foreground and a background PNG, both with alpha. */
export async function segmentImage(
  uri: string,
  options: ProcessOptions = {}
): Promise<SegmentationResult> {
  return ExpoBackgroundRemovalModule.segmentImage(uri, options);
}

/** One cropped transparent PNG per detected subject. */
export async function extractObjects(
  uri: string,
  options: ProcessOptions = {}
): Promise<ExtractedObject[]> {
  return ExpoBackgroundRemovalModule.extractObjects(uri, options);
}
