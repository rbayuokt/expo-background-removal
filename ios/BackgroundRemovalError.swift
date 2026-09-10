import ExpoModulesCore

internal enum BackgroundRemovalErrorCode: String {
  case invalidUri = "INVALID_URI"
  case fileNotFound = "FILE_NOT_FOUND"
  case invalidImage = "INVALID_IMAGE"
  case unsupportedOS = "UNSUPPORTED_OS"
  case noSubjectFound = "NO_SUBJECT_FOUND"
  case segmentationFailed = "SEGMENTATION_FAILED"
  case imageRenderFailed = "IMAGE_RENDER_FAILED"
  case imageWriteFailed = "IMAGE_WRITE_FAILED"
}

/**
 Expo's `Exception` derives its code from the class name (`FooException` -> `ERR_FOO`).
 Overriding `code` keeps JS on the stable codes documented in the TS types.
 */
internal final class BackgroundRemovalException: Exception {
  private let errorCode: String
  private let message: String

  init(_ code: BackgroundRemovalErrorCode, _ message: String, cause: Error? = nil) {
    self.errorCode = code.rawValue
    self.message = message
    super.init()
    self.cause = cause
  }

  override var code: String {
    errorCode
  }

  override var reason: String {
    message
  }
}
