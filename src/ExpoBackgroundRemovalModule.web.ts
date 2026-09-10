import { registerWebModule, NativeModule } from 'expo';

import type {
  ExtractedObject,
  ProcessOptions,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  SegmentationResult,
} from './ExpoBackgroundRemoval.types';

function unsupported(): never {
  const error = new Error('expo-background-removal is not available on web.');
  (error as Error & { code: string }).code = 'UNSUPPORTED_OS';
  throw error;
}

// ExpoBackgroundRemovalModule is not available on the web platform.
class ExpoBackgroundRemovalModule extends NativeModule<{}> {
  async removeBackground(
    _uri: string,
    _options: RemoveBackgroundOptions
  ): Promise<RemoveBackgroundResult> {
    unsupported();
  }
  async toPng(_uri: string, _options: ProcessOptions): Promise<RemoveBackgroundResult> {
    unsupported();
  }
  async segmentImage(_uri: string, _options: ProcessOptions): Promise<SegmentationResult> {
    unsupported();
  }
  async extractObjects(_uri: string, _options: ProcessOptions): Promise<ExtractedObject[]> {
    unsupported();
  }
}

export default registerWebModule(ExpoBackgroundRemovalModule, 'ExpoBackgroundRemovalModule');
