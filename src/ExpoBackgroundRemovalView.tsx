import { requireNativeView } from 'expo';
import type { StyleProp, ViewStyle } from 'react-native';

export type SubjectsEvent = {
  nativeEvent: { count: number; reason?: string; analysis?: boolean };
};

export type LoadEvent = {
  nativeEvent: { loaded: boolean; width?: number; height?: number; reason?: string };
};

export type BackgroundRemovalViewProps = {
  /** Local `file://` URI (iOS) or `file://` / `content://` URI (Android). */
  source?: string;
  /**
   * iOS: runs Apple's subject highlight, the glow Photos plays when you lift a subject.
   * Android: ignored, the view only renders the image.
   */
  highlightSubjects?: boolean;
  /** Fires once the image is decoded, or with a reason when it could not be. */
  onLoad?: (event: LoadEvent) => void;
  onSubjects?: (event: SubjectsEvent) => void;
  style?: StyleProp<ViewStyle>;
};

const NativeView = requireNativeView<BackgroundRemovalViewProps>('ExpoBackgroundRemoval');

/**
 * Subject lifting through VisionKit. Long press a subject on iOS 17+ and it lifts out with
 * the system animation, no Skia and no file written. To get a PNG, use `removeBackground()`.
 */
export function BackgroundRemovalView(props: BackgroundRemovalViewProps) {
  return <NativeView {...props} />;
}
