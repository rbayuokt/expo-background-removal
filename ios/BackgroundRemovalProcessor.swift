import CoreImage
import ImageIO
import Vision

internal struct ProcessedImage {
  let url: URL
  let width: Int
  let height: Int

  var dictionary: [String: Any] {
    ["uri": url.absoluteString, "width": width, "height": height]
  }
}

/**
 `VNGenerateForegroundInstanceMaskRequest` lives in Vision (not VisionKit) and is iOS 17+.
 It has no CPU fallback, so it fails on the Simulator and needs a device.
 */
@available(iOS 17.0, *)
internal final class BackgroundRemovalProcessor {
  private let outputDirectory: URL
  private let ciContext: CIContext

  init(cacheDirectory: URL) {
    outputDirectory = cacheDirectory.appendingPathComponent("background-removal", isDirectory: true)
    // Each buffer is rendered once, so caching intermediates only costs memory.
    ciContext = CIContext(options: [.useSoftwareRenderer: false, .cacheIntermediates: false])
  }

  // MARK: - Public operations

  func removeBackground(uri: String, cropToSubject: Bool, maxDimension: Int?) throws -> ProcessedImage {
    return try autoreleasepool {
      let image = try decodeUprightImage(at: try fileURL(from: uri), maxDimension: maxDimension)
      let handler = makeHandler(for: image)
      let (observation, instances) = try foregroundInstances(handler: handler)
      let masked = try maskedImage(observation, instances, handler, cropped: cropToSubject)

      return try writePNG(CIImage(cvPixelBuffer: masked))
    }
  }

  /// Decodes any supported format, applies the EXIF transform and writes a PNG.
  /// Skia has no HEIF decoder, so an iPhone photo needs this before it can be drawn there.
  func toPng(uri: String, maxDimension: Int?) throws -> ProcessedImage {
    return try autoreleasepool {
      let image = try decodeUprightImage(at: try fileURL(from: uri), maxDimension: maxDimension)
      return try writePNG(CIImage(cgImage: image))
    }
  }

  func segmentImage(uri: String, maxDimension: Int?) throws -> [String: Any] {
    return try autoreleasepool {
      let image = try decodeUprightImage(at: try fileURL(from: uri), maxDimension: maxDimension)
      let handler = makeHandler(for: image)
      let (observation, instances) = try foregroundInstances(handler: handler)

      let foreground = try autoreleasepool { () -> ProcessedImage in
        let masked = try maskedImage(observation, instances, handler, cropped: false)
        return try writePNG(CIImage(cvPixelBuffer: masked))
      }

      let background = try autoreleasepool { () -> ProcessedImage in
        let maskBuffer: CVPixelBuffer
        do {
          maskBuffer = try observation.generateScaledMaskForImage(forInstances: instances, from: handler)
        } catch {
          throw BackgroundRemovalException(.imageRenderFailed, "Could not generate the subject mask.", cause: error)
        }
        let source = CIImage(cgImage: image)
        // Transparent over the original where the mask is white, so the subject ends at
        // alpha 0 and the background pixels are untouched.
        let inverse = CIImage(color: .clear)
          .applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: source,
            kCIInputMaskImageKey: CIImage(cvPixelBuffer: maskBuffer)
          ])
          .cropped(to: source.extent)
        return try writePNG(inverse)
      }

      return [
        "foregroundUri": foreground.url.absoluteString,
        "backgroundUri": background.url.absoluteString,
        "width": foreground.width,
        "height": foreground.height
      ]
    }
  }

  func extractObjects(uri: String, maxDimension: Int?) throws -> [[String: Any]] {
    return try autoreleasepool {
      let image = try decodeUprightImage(at: try fileURL(from: uri), maxDimension: maxDimension)
      let handler = makeHandler(for: image)
      let (observation, instances) = try foregroundInstances(handler: handler)

      var objects: [[String: Any]] = []
      objects.reserveCapacity(instances.count)

      for instance in instances {
        // One instance at a time so only a single full-res buffer is alive.
        try autoreleasepool {
          let masked = try maskedImage(observation, IndexSet(integer: instance), handler, cropped: true)
          objects.append(try writePNG(CIImage(cvPixelBuffer: masked)).dictionary)
        }
      }
      return objects
    }
  }

  // MARK: - Input

  private func fileURL(from uri: String) throws -> URL {
    let url: URL
    if uri.hasPrefix("file://") {
      guard let parsed = URL(string: uri) else {
        throw BackgroundRemovalException(.invalidUri, "'\(uri)' is not a valid file URI.")
      }
      url = parsed
    } else if uri.hasPrefix("/") {
      url = URL(fileURLWithPath: uri)
    } else {
      throw BackgroundRemovalException(.invalidUri, "Only local file:// URIs are supported, got '\(uri)'.")
    }

    guard FileManager.default.fileExists(atPath: url.path) else {
      throw BackgroundRemovalException(.fileNotFound, "No file exists at \(url.path).")
    }
    return url
  }

  /**
   Bakes the EXIF transform into the pixels, so everything downstream is upright and
   Vision gets `.up`. The same pass applies `maxDimension`, so a 12MP HEIC is never
   fully expanded when the caller asked for less.
   */
  private func decodeUprightImage(at url: URL, maxDimension: Int?) throws -> CGImage {
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions), CGImageSourceGetCount(source) > 0 else {
      throw BackgroundRemovalException(.invalidImage, "Could not read an image from \(url.lastPathComponent).")
    }
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let pixelWidth = properties[kCGImagePropertyPixelWidth] as? Int,
      let pixelHeight = properties[kCGImagePropertyPixelHeight] as? Int,
      pixelWidth > 0, pixelHeight > 0 else {
      throw BackgroundRemovalException(.invalidImage, "\(url.lastPathComponent) is not a decodable image.")
    }

    let longestEdge = max(pixelWidth, pixelHeight)
    let limit = max(min(maxDimension ?? longestEdge, longestEdge), 1)
    let thumbnailOptions: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      // Rotates/flips the output according to the EXIF orientation of the full image.
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: limit
    ]

    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else {
      throw BackgroundRemovalException(.invalidImage, "Could not decode \(url.lastPathComponent).")
    }
    return image
  }

  // MARK: - Vision

  private func makeHandler(for image: CGImage) -> VNImageRequestHandler {
    // Orientation is already baked into the pixels by the decode step.
    return VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
  }

  private func foregroundInstances(
    handler: VNImageRequestHandler
  ) throws -> (VNInstanceMaskObservation, IndexSet) {
    let request = VNGenerateForegroundInstanceMaskRequest()
    do {
      try handler.perform([request])
    } catch {
      throw BackgroundRemovalException(
        .segmentationFailed,
        "Vision could not run foreground segmentation. This request has no CPU fallback and does not work on the iOS Simulator.",
        cause: error
      )
    }

    guard let observation = request.results?.first else {
      throw BackgroundRemovalException(.noSubjectFound, "No foreground subject was found in the image.")
    }
    // Index 0 is reserved for the background.
    let instances = observation.allInstances.subtracting(IndexSet(integer: 0))
    guard !instances.isEmpty else {
      throw BackgroundRemovalException(.noSubjectFound, "No foreground subject was found in the image.")
    }
    return (observation, instances)
  }

  private func maskedImage(
    _ observation: VNInstanceMaskObservation,
    _ instances: IndexSet,
    _ handler: VNImageRequestHandler,
    cropped: Bool
  ) throws -> CVPixelBuffer {
    do {
      return try observation.generateMaskedImage(
        ofInstances: instances,
        from: handler,
        croppedToInstancesExtent: cropped
      )
    } catch {
      throw BackgroundRemovalException(.imageRenderFailed, "Could not render the masked image.", cause: error)
    }
  }

  // MARK: - Output

  private func writePNG(_ image: CIImage) throws -> ProcessedImage {
    let extent = image.extent
    guard !extent.isInfinite, extent.width >= 1, extent.height >= 1 else {
      throw BackgroundRemovalException(.imageRenderFailed, "The rendered image is empty.")
    }

    let url = try makeOutputURL()
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
      throw BackgroundRemovalException(.imageRenderFailed, "Could not create the sRGB color space.")
    }

    do {
      // RGBA8 keeps a real alpha channel; PNG never flattens it against a matte.
      try ciContext.writePNGRepresentation(of: image, to: url, format: .RGBA8, colorSpace: colorSpace, options: [:])
    } catch {
      throw BackgroundRemovalException(.imageWriteFailed, "Could not write the PNG to \(url.path).", cause: error)
    }
    ciContext.clearCaches()

    return ProcessedImage(url: url, width: Int(extent.width.rounded()), height: Int(extent.height.rounded()))
  }

  private func makeOutputURL() throws -> URL {
    do {
      try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
    } catch {
      throw BackgroundRemovalException(.imageWriteFailed, "Could not create the output directory.", cause: error)
    }
    return outputDirectory.appendingPathComponent("\(UUID().uuidString).png")
  }
}
