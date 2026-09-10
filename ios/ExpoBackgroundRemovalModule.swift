import ExpoModulesCore

internal struct ProcessOptions: Record {
  @Field var maxDimension: Int?
}

internal struct RemoveBackgroundOptions: Record {
  @Field var cropToSubject: Bool = false
  @Field var maxDimension: Int?
}

public class ExpoBackgroundRemovalModule: Module {
  // Expo's default async queue is shared by every module; keep the heavy work off it.
  private let processingQueue = DispatchQueue(label: "expo.modules.backgroundremoval", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("ExpoBackgroundRemoval")

    AsyncFunction("removeBackground") { (uri: String, options: RemoveBackgroundOptions) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw Self.unsupportedOS()
      }
      return try Self.makeProcessor().removeBackground(
        uri: uri,
        cropToSubject: options.cropToSubject,
        maxDimension: options.maxDimension
      ).dictionary
    }
    .runOnQueue(processingQueue)

    AsyncFunction("toPng") { (uri: String, options: ProcessOptions) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw Self.unsupportedOS()
      }
      return try Self.makeProcessor().toPng(uri: uri, maxDimension: options.maxDimension).dictionary
    }
    .runOnQueue(processingQueue)

    AsyncFunction("segmentImage") { (uri: String, options: ProcessOptions) -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw Self.unsupportedOS()
      }
      return try Self.makeProcessor().segmentImage(uri: uri, maxDimension: options.maxDimension)
    }
    .runOnQueue(processingQueue)

    AsyncFunction("extractObjects") { (uri: String, options: ProcessOptions) -> [[String: Any]] in
      guard #available(iOS 17.0, *) else {
        throw Self.unsupportedOS()
      }
      return try Self.makeProcessor().extractObjects(uri: uri, maxDimension: options.maxDimension)
    }
    .runOnQueue(processingQueue)

    // Apple's native subject lifting. iOS only; on Android the view just shows the image.
    View(ExpoBackgroundRemovalView.self) {
      Events("onSubjects", "onLoad")

      Prop("source") { (view: ExpoBackgroundRemovalView, uri: String?) in
        view.setSource(uri)
      }

      Prop("highlightSubjects") { (view: ExpoBackgroundRemovalView, highlight: Bool) in
        view.setHighlightSubjects(highlight)
      }
    }
  }

  // Static so the function bodies don't retain the module.
  @available(iOS 17.0, *)
  private static func makeProcessor() -> BackgroundRemovalProcessor {
    let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    return BackgroundRemovalProcessor(cacheDirectory: cacheDirectory)
  }

  private static func unsupportedOS() -> BackgroundRemovalException {
    return BackgroundRemovalException(
      .unsupportedOS,
      "Foreground instance segmentation requires iOS 17 or newer."
    )
  }
}
