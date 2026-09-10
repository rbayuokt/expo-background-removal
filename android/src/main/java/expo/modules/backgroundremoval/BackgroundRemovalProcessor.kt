package expo.modules.backgroundremoval

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.Subject
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max

/**
 * ML Kit Subject Segmentation (beta) based foreground extraction.
 *
 * Unlike Selfie Segmentation this model targets general objects, and returns each subject
 * separately, so [extractObjects] is real instance separation on Android too.
 */
internal class BackgroundRemovalProcessor(
  private val context: Context,
  cacheRoot: File
) {
  private val outputDirectory = File(cacheRoot, "background-removal")

  suspend fun removeBackground(uri: String, cropToSubject: Boolean, maxDimension: Int?): Map<String, Any> {
    val input = resolveInput(uri)
    try {
      val bitmap = decodeUpright(input.file, maxDimension)
      try {
        val options = SubjectSegmenterOptions.Builder()
          .enableMultipleSubjects(subjectBitmaps())
          .build()

        return withSegmentation(bitmap, options) { result ->
          val subjects = requireSubjects(result)
          val foreground = composeSubjects(subjects, bitmap.width, bitmap.height)

          try {
            if (!cropToSubject) {
              writePng(foreground)
            } else {
            val bounds = subjectBounds(subjects, foreground.width, foreground.height)
            val cropped = Bitmap.createBitmap(
              foreground,
              bounds.left,
              bounds.top,
              bounds.width(),
              bounds.height()
            )
              try {
                writePng(cropped)
              } finally {
                if (cropped !== foreground) {
                  cropped.recycle()
                }
              }
            }
          } finally {
            foreground.recycle()
          }
        }
      } finally {
        bitmap.recycle()
      }
    } finally {
      input.cleanUp()
    }
  }

  /**
   * Decodes any supported format, applies the EXIF orientation and writes a PNG.
   * Skia has no HEIF decoder, so an iPhone photo needs this before it can be drawn there.
   */
  suspend fun toPng(uri: String, maxDimension: Int?): Map<String, Any> {
    val input = resolveInput(uri)
    try {
      val bitmap = decodeUpright(input.file, maxDimension)
      try {
        return writePng(bitmap)
      } finally {
        bitmap.recycle()
      }
    } finally {
      input.cleanUp()
    }
  }

  suspend fun segmentImage(uri: String, maxDimension: Int?): Map<String, Any> {
    val input = resolveInput(uri)
    try {
      val bitmap = decodeUpright(input.file, maxDimension)
      try {
        val options = SubjectSegmenterOptions.Builder()
          .enableMultipleSubjects(subjectBitmaps())
          .build()

        return withSegmentation(bitmap, options) { result ->
          val subjects = requireSubjects(result)

          val foreground = composeSubjects(subjects, bitmap.width, bitmap.height)
          val foregroundOutput = try {
            writePng(foreground)
          } finally {
            foreground.recycle()
          }
          val background = punchSubjects(bitmap, subjects)
          val backgroundOutput = try {
            writePng(background)
          } finally {
            background.recycle()
          }

          mapOf(
            "foregroundUri" to foregroundOutput.getValue("uri"),
            "backgroundUri" to backgroundOutput.getValue("uri"),
            "width" to foreground.width,
            "height" to foreground.height
          )
        }
      } finally {
        bitmap.recycle()
      }
    } finally {
      input.cleanUp()
    }
  }

  suspend fun extractObjects(uri: String, maxDimension: Int?): List<Map<String, Any>> {
    val input = resolveInput(uri)
    try {
      val bitmap = decodeUpright(input.file, maxDimension)
      try {
        val options = SubjectSegmenterOptions.Builder()
          .enableMultipleSubjects(
            SubjectSegmenterOptions.SubjectResultOptions.Builder()
              .enableSubjectBitmap()
              .build()
          )
          .build()

        return withSegmentation(bitmap, options) { result ->
          requireSubjects(result).map { subject ->
            val subjectBitmap = subject.bitmap
              ?: throw BackgroundRemovalException(ErrorCodes.SEGMENTATION_FAILED, "ML Kit returned no bitmap for a subject.")
            writePng(subjectBitmap)
          }
        }
      } finally {
        bitmap.recycle()
      }
    } finally {
      input.cleanUp()
    }
  }

  private class ResolvedInput(val file: File, private val temporary: Boolean) {
    fun cleanUp() {
      if (temporary) {
        file.delete()
      }
    }
  }

  /**
   * `content://` from a photo picker is not a filesystem path, and BitmapFactory plus
   * ExifInterface both need to read the source, so it lands in a temp file first.
   */
  private fun resolveInput(uri: String): ResolvedInput {
    if (uri.isBlank()) {
      throw BackgroundRemovalException(ErrorCodes.INVALID_URI, "The image URI is empty.")
    }
    val parsed = Uri.parse(uri)

    return when (parsed.scheme) {
      null, "file" -> {
        val path = parsed.path
          ?: throw BackgroundRemovalException(ErrorCodes.INVALID_URI, "'$uri' has no file path.")
        val file = File(path)
        if (!file.exists()) {
          throw BackgroundRemovalException(ErrorCodes.FILE_NOT_FOUND, "No file exists at $path.")
        }
        ResolvedInput(file, temporary = false)
      }

      "content" -> ResolvedInput(copyToCache(parsed), temporary = true)

      else -> throw BackgroundRemovalException(
        ErrorCodes.INVALID_URI,
        "Unsupported URI scheme '${parsed.scheme}'. Use file:// or content://."
      )
    }
  }

  private fun copyToCache(uri: Uri): File {
    ensureOutputDirectory()
    val target = File(outputDirectory, "input-${UUID.randomUUID()}")
    try {
      val stream = context.contentResolver.openInputStream(uri)
        ?: throw BackgroundRemovalException(ErrorCodes.FILE_NOT_FOUND, "Could not open $uri.")
      stream.use { input ->
        FileOutputStream(target).use { output -> input.copyTo(output) }
      }
    } catch (error: FileNotFoundException) {
      throw BackgroundRemovalException(ErrorCodes.FILE_NOT_FOUND, "Could not open $uri.", error)
    } catch (error: SecurityException) {
      throw BackgroundRemovalException(ErrorCodes.INVALID_URI, "No read permission for $uri.", error)
    } catch (error: IOException) {
      throw BackgroundRemovalException(ErrorCodes.FILE_NOT_FOUND, "Could not read $uri.", error)
    }
    return target
  }

  /** Decodes at (or under) [maxDimension] and bakes the EXIF orientation into the pixels. */
  private fun decodeUpright(file: File, maxDimension: Int?): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw BackgroundRemovalException(ErrorCodes.INVALID_IMAGE, "${file.name} is not a decodable image.")
    }

    val decodeOptions = BitmapFactory.Options().apply {
      inPreferredConfig = Bitmap.Config.ARGB_8888
      inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxDimension)
    }
    val decoded = BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
      ?: throw BackgroundRemovalException(ErrorCodes.INVALID_IMAGE, "Could not decode ${file.name}.")

    return applyExifOrientation(scaleDown(decoded, maxDimension), file)
  }

  private fun sampleSizeFor(width: Int, height: Int, maxDimension: Int?): Int {
    if (maxDimension == null || maxDimension <= 0) {
      return 1
    }
    var sample = 1
    while (max(width, height) / (sample * 2) >= maxDimension) {
      sample *= 2
    }
    return sample
  }

  /** inSampleSize only halves, so trim the remainder to hit maxDimension exactly. */
  private fun scaleDown(bitmap: Bitmap, maxDimension: Int?): Bitmap {
    if (maxDimension == null || maxDimension <= 0) {
      return bitmap
    }
    val longestEdge = max(bitmap.width, bitmap.height)
    if (longestEdge <= maxDimension) {
      return bitmap
    }
    val ratio = maxDimension.toFloat() / longestEdge
    val scaled = Bitmap.createScaledBitmap(
      bitmap,
      max((bitmap.width * ratio).toInt(), 1),
      max((bitmap.height * ratio).toInt(), 1),
      true
    )
    if (scaled !== bitmap) {
      bitmap.recycle()
    }
    return scaled
  }

  private fun applyExifOrientation(bitmap: Bitmap, file: File): Bitmap {
    val orientation = try {
      ExifInterface(file.absolutePath)
        .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (error: IOException) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(270f)
        matrix.postScale(-1f, 1f)
      }
      else -> return bitmap
    }

    val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (oriented !== bitmap) {
      bitmap.recycle()
    }
    return oriented
  }

  private suspend fun <T> withSegmentation(
    bitmap: Bitmap,
    options: SubjectSegmenterOptions,
    block: (SubjectSegmentationResult) -> T
  ): T {
    val segmenter = SubjectSegmentation.getClient(options)
    try {
      val result = suspendCancellableCoroutine { continuation ->
        segmenter.process(InputImage.fromBitmap(bitmap, 0))
          .addOnSuccessListener { continuation.resume(it) }
          .addOnFailureListener { error ->
            continuation.resumeWithException(
              BackgroundRemovalException(
                ErrorCodes.SEGMENTATION_FAILED,
                "ML Kit subject segmentation failed: ${error.message}",
                error
              )
            )
          }
          .addOnCanceledListener { continuation.cancel() }
      }
      return block(result)
    } finally {
      segmenter.close()
    }
  }

  private fun requireSubjects(result: SubjectSegmentationResult): List<Subject> {
    val subjects = result.subjects
    if (subjects.isEmpty()) {
      throw BackgroundRemovalException(ErrorCodes.NO_SUBJECT_FOUND, "No foreground subject was found in the image.")
    }
    return subjects
  }

  private fun subjectBounds(subjects: List<Subject>, width: Int, height: Int): Rect {
    val bounds = Rect(width, height, 0, 0)
    subjects.forEach { subject ->
      bounds.left = minOf(bounds.left, subject.startX)
      bounds.top = minOf(bounds.top, subject.startY)
      bounds.right = maxOf(bounds.right, subject.startX + subject.width)
      bounds.bottom = maxOf(bounds.bottom, subject.startY + subject.height)
    }
    bounds.left = bounds.left.coerceIn(0, width - 1)
    bounds.top = bounds.top.coerceIn(0, height - 1)
    bounds.right = bounds.right.coerceIn(bounds.left + 1, width)
    bounds.bottom = bounds.bottom.coerceIn(bounds.top + 1, height)
    return bounds
  }

  private fun subjectBitmaps() =
    SubjectSegmenterOptions.SubjectResultOptions.Builder().enableSubjectBitmap().build()

  /**
   * ML Kit's whole-frame outputs (`foregroundBitmap`, `foregroundConfidenceMask`) shear the
   * image on some devices and can segfault inside its native code, so both halves are
   * built from the per-subject bitmaps instead.
   */
  private fun composeSubjects(subjects: List<Subject>, width: Int, height: Int): Bitmap {
    val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    subjects.forEach { subject ->
      val bitmap = subject.bitmap
        ?: throw BackgroundRemovalException(ErrorCodes.SEGMENTATION_FAILED, "ML Kit returned no bitmap for a subject.")
      canvas.drawBitmap(bitmap, subject.startX.toFloat(), subject.startY.toFloat(), null)
    }
    return output
  }

  /** The original with each subject punched out, so the two halves are exact complements. */
  private fun punchSubjects(source: Bitmap, subjects: List<Subject>): Bitmap {
    val output = source.copy(Bitmap.Config.ARGB_8888, true)
    val canvas = Canvas(output)
    val eraser = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT) }
    subjects.forEach { subject ->
      val bitmap = subject.bitmap ?: return@forEach
      canvas.drawBitmap(bitmap, subject.startX.toFloat(), subject.startY.toFloat(), eraser)
    }
    return output
  }

  private fun ensureOutputDirectory() {
    if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
      throw BackgroundRemovalException(
        ErrorCodes.IMAGE_WRITE_FAILED,
        "Could not create ${outputDirectory.absolutePath}."
      )
    }
  }

  private fun writePng(bitmap: Bitmap): Map<String, Any> {
    ensureOutputDirectory()
    val file = File(outputDirectory, "${UUID.randomUUID()}.png")
    try {
      FileOutputStream(file).use { output ->
        // PNG keeps the alpha channel; quality is ignored for a lossless format.
        if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
          throw IOException("Bitmap.compress returned false")
        }
      }
    } catch (error: IOException) {
      throw BackgroundRemovalException(
        ErrorCodes.IMAGE_WRITE_FAILED,
        "Could not write the PNG to ${file.absolutePath}.",
        error
      )
    }

    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "width" to bitmap.width,
      "height" to bitmap.height
    )
  }
}
