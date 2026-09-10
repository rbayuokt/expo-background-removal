package expo.modules.backgroundremoval

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.ImageView
import android.widget.FrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.InputStream
import kotlin.math.max

/**
 * Android has no equivalent of VisionKit's subject lifting, so this only shows the image.
 * `highlightSubjects` is accepted and ignored to keep the JSX identical on both platforms.
 */
class ExpoBackgroundRemovalView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {

  private val imageView = ImageView(context).apply {
    scaleType = ImageView.ScaleType.FIT_CENTER
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }
  private val onSubjects by EventDispatcher()
  private val onLoad by EventDispatcher()
  private val scope = CoroutineScope(Dispatchers.Main.immediate)
  private var loading: Job? = null

  init {
    addView(imageView)
  }

  fun setSource(uri: String?) {
    loading?.cancel()
    if (uri.isNullOrBlank()) {
      imageView.setImageDrawable(null)
      onLoad(mapOf("loaded" to false, "reason" to "no source"))
      return
    }

    loading = scope.launch {
      // Decoding on the UI thread would jank on a 12MP photo.
      val bitmap = withContext(Dispatchers.IO) {
        runCatching {
          val parsed = Uri.parse(uri)
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          openStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }

          val target = max(width, height).takeIf { it > 0 } ?: 2048
          val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(max(bounds.outWidth, bounds.outHeight), target)
          }
          openStream(parsed)?.use { BitmapFactory.decodeStream(it, null, options) }
        }.getOrNull()
      }
      imageView.setImageBitmap(bitmap)
      if (bitmap == null) {
        onLoad(mapOf("loaded" to false, "reason" to "could not decode $uri"))
      } else {
        onLoad(mapOf("loaded" to true, "width" to bitmap.width, "height" to bitmap.height))
        onSubjects(mapOf("count" to 0, "reason" to "no subject lifting on Android"))
      }
    }
  }

  /** Accepted for API parity with iOS, where it drives VisionKit's highlight. */
  fun setHighlightSubjects(highlight: Boolean) = Unit

  private fun openStream(uri: Uri): InputStream? = when (uri.scheme) {
    null, "file" -> uri.path?.let { java.io.File(it).inputStream() }
    else -> context.contentResolver.openInputStream(uri)
  }

  private fun sampleSizeFor(longestEdge: Int, target: Int): Int {
    var sample = 1
    while (longestEdge / (sample * 2) >= target) {
      sample *= 2
    }
    return sample
  }
}
