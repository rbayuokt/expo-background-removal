package expo.modules.backgroundremoval

import expo.modules.kotlin.exception.CodedException

internal object ErrorCodes {
  const val INVALID_URI = "INVALID_URI"
  const val FILE_NOT_FOUND = "FILE_NOT_FOUND"
  const val INVALID_IMAGE = "INVALID_IMAGE"
  const val UNSUPPORTED_OS = "UNSUPPORTED_OS"
  const val NO_SUBJECT_FOUND = "NO_SUBJECT_FOUND"
  const val SEGMENTATION_FAILED = "SEGMENTATION_FAILED"
  const val IMAGE_RENDER_FAILED = "IMAGE_RENDER_FAILED"
  const val IMAGE_WRITE_FAILED = "IMAGE_WRITE_FAILED"
}

/**
 * CodedException infers its code from the class name (`FooException` -> `ERR_FOO`).
 * Passing the code explicitly keeps JS on the same codes as iOS.
 */
internal class BackgroundRemovalException(
  code: String,
  message: String,
  cause: Throwable? = null
) : CodedException(code, message, cause)
