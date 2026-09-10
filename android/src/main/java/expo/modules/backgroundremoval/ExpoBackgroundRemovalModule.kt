package expo.modules.backgroundremoval

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ProcessOptions : Record {
  @Field
  var maxDimension: Int? = null
}

class RemoveBackgroundOptions : Record {
  @Field
  var cropToSubject: Boolean = false

  @Field
  var maxDimension: Int? = null
}

class ExpoBackgroundRemovalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBackgroundRemoval")

    // Coroutine bodies run on Expo's shared modules queue, so the heavy work moves to
    // Dispatchers.Default rather than holding that queue for every other module.
    AsyncFunction("removeBackground") Coroutine { uri: String, options: RemoveBackgroundOptions ->
      return@Coroutine withContext(Dispatchers.Default) {
        processor().removeBackground(uri, options.cropToSubject, options.maxDimension)
      }
    }

    AsyncFunction("toPng") Coroutine { uri: String, options: ProcessOptions ->
      return@Coroutine withContext(Dispatchers.Default) {
        processor().toPng(uri, options.maxDimension)
      }
    }

    AsyncFunction("segmentImage") Coroutine { uri: String, options: ProcessOptions ->
      return@Coroutine withContext(Dispatchers.Default) {
        processor().segmentImage(uri, options.maxDimension)
      }
    }

    AsyncFunction("extractObjects") Coroutine { uri: String, options: ProcessOptions ->
      return@Coroutine withContext(Dispatchers.Default) {
        processor().extractObjects(uri, options.maxDimension)
      }
    }

    // Present for API parity: on Android it only renders the image, see the view's docs.
    View(ExpoBackgroundRemovalView::class) {
      Events("onSubjects", "onLoad")

      Prop("source") { view: ExpoBackgroundRemovalView, uri: String? ->
        view.setSource(uri)
      }

      Prop("highlightSubjects") { view: ExpoBackgroundRemovalView, highlight: Boolean ->
        view.setHighlightSubjects(highlight)
      }
    }
  }

  private fun processor(): BackgroundRemovalProcessor {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return BackgroundRemovalProcessor(context, appContext.cacheDirectory)
  }
}
