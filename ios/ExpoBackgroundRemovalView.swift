import ExpoModulesCore
import UIKit
import VisionKit

/**
 Apple's subject lifting: press and hold a subject and it lifts out with the system glow,
 and `highlightSubjects` plays the same animation without a gesture. A live view, so it
 writes no file; `removeBackground()` is what produces a PNG.
 */
public final class ExpoBackgroundRemovalView: ExpoView {
  private let imageView = UIImageView()
  private var interaction: AnyObject?
  private var wantsHighlight = false

  let onSubjects = EventDispatcher()
  let onLoad = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    imageView.contentMode = .scaleAspectFit
    imageView.isUserInteractionEnabled = true
    isUserInteractionEnabled = true
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    imageView.frame = bounds
    addSubview(imageView)

    if #available(iOS 17.0, *) {
      let subjectInteraction = ImageAnalysisInteraction()
      // Subject lifting only: no Live Text, no data detectors.
      subjectInteraction.preferredInteractionTypes = .imageSubject
      imageView.addInteraction(subjectInteraction)
      interaction = subjectInteraction
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
  }

  func setSource(_ uri: String?) {
    guard let uri, !uri.isEmpty else {
      imageView.image = nil
      onLoad(["loaded": false, "reason": "no source"])
      return
    }

    // Decoding a 12MP photo on the main thread would drop frames.
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let (image, reason) = Self.loadImage(from: uri)

      DispatchQueue.main.async {
        guard let self else {
          return
        }
        self.imageView.image = image

        if let image {
          self.setNeedsLayout()
          self.layoutIfNeeded()
          self.onLoad([
            "loaded": true,
            "width": Int(image.size.width * image.scale),
            "height": Int(image.size.height * image.scale)
          ])
          self.syncSubjects()
        } else {
          self.onLoad(["loaded": false, "reason": reason ?? "unknown"])
        }
      }
    }
  }

  func setHighlightSubjects(_ highlight: Bool) {
    wantsHighlight = highlight
    syncSubjects()
  }

  private func syncSubjects() {
    guard #available(iOS 17.0, *), let interaction = interaction as? ImageAnalysisInteraction else {
      onSubjects(["count": 0, "reason": "requires iOS 17"])
      return
    }
    guard let image = imageView.image else {
      return
    }

    Task { @MainActor [weak self] in
      guard let self else {
        return
      }

      // Apple's sample assigns an analysis before lifting works. There is no analysis
      // type for subjects, so an empty configuration is enough to prime the interaction.
      if interaction.analysis == nil {
        do {
          interaction.analysis = try await ImageAnalyzer().analyze(
            image,
            configuration: ImageAnalyzer.Configuration([])
          )
        } catch {
          self.onSubjects(["count": 0, "reason": "analyze failed: \(error.localizedDescription)"])
        }
      }

      let subjects = await interaction.subjects
      self.onSubjects(["count": subjects.count, "analysis": interaction.analysis != nil])
      // Assigning this plays Apple's highlight animation.
      interaction.highlightedSubjects = self.wantsHighlight ? subjects : []
    }
  }

  /// Accepts `file://` or a bare path, and names the step that failed.
  private static func loadImage(from uri: String) -> (UIImage?, String?) {
    let url: URL
    if uri.hasPrefix("file://") {
      guard let parsed = URL(string: uri) else {
        return (nil, "unparsable file URI")
      }
      url = parsed
    } else if uri.hasPrefix("/") {
      url = URL(fileURLWithPath: uri)
    } else {
      return (nil, "unsupported scheme in \(uri.prefix(24))")
    }

    guard FileManager.default.fileExists(atPath: url.path) else {
      return (nil, "no file at \(url.lastPathComponent)")
    }
    if let image = UIImage(contentsOfFile: url.path) {
      return (image, nil)
    }
    // HEIC and some picker output decode from Data when the path loader gives up.
    guard let data = try? Data(contentsOf: url) else {
      return (nil, "could not read \(url.lastPathComponent)")
    }
    guard let image = UIImage(data: data) else {
      return (nil, "could not decode \(url.lastPathComponent)")
    }
    return (image, nil)
  }
}
