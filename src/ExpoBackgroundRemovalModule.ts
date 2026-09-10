import { NativeModule, requireNativeModule } from 'expo';

import type {
  ExtractedObject,
  ProcessOptions,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  SegmentationResult,
} from './ExpoBackgroundRemoval.types';

declare class ExpoBackgroundRemovalModule extends NativeModule<{}> {
  removeBackground(uri: string, options: RemoveBackgroundOptions): Promise<RemoveBackgroundResult>;
  toPng(uri: string, options: ProcessOptions): Promise<RemoveBackgroundResult>;
  segmentImage(uri: string, options: ProcessOptions): Promise<SegmentationResult>;
  extractObjects(uri: string, options: ProcessOptions): Promise<ExtractedObject[]>;
}

export default requireNativeModule<ExpoBackgroundRemovalModule>('ExpoBackgroundRemoval');
