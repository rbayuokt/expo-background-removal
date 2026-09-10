/** Stable error codes thrown by the native module. Available on `error.code`. */
export type BackgroundRemovalErrorCode =
  | 'INVALID_URI'
  | 'FILE_NOT_FOUND'
  | 'INVALID_IMAGE'
  | 'UNSUPPORTED_OS'
  | 'NO_SUBJECT_FOUND'
  | 'SEGMENTATION_FAILED'
  | 'IMAGE_RENDER_FAILED'
  | 'IMAGE_WRITE_FAILED';

export type ProcessOptions = {
  /**
   * Longest edge in pixels, applied before segmentation. Omit for full resolution.
   * Lower values cut memory and time, and blunt thin edges like hair or cables.
   */
  maxDimension?: number;
};

export type RemoveBackgroundOptions = ProcessOptions & {
  /**
   * Crop the output to the bounds of the detected subjects.
   * When false (default) the original canvas is kept and background pixels get alpha 0.
   */
  cropToSubject?: boolean;
};

export type RemoveBackgroundResult = {
  /** `file://` URI of a transparent PNG in the app cache directory. */
  uri: string;
  width: number;
  height: number;
};

export type SegmentationResult = {
  /** Subject pixels kept, background transparent. */
  foregroundUri: string;
  /** Background pixels kept, subject transparent. */
  backgroundUri?: string;
  width: number;
  height: number;
};

export type ExtractedObject = {
  uri: string;
  width: number;
  height: number;
};
