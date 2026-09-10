# @rbayuokt/expo-background-removal

Cut the subject out of a product photo on device and get back a transparent PNG.
Point it at a local image, it runs the platform's own segmentation model, writes the
result into the app cache directory and hands JavaScript a `file://` URI. No pixels,
masks or base64 cross the bridge.

iOS uses Vision's `VNGenerateForegroundInstanceMaskRequest`, Android uses ML Kit
Subject Segmentation. Both target general objects (shoes, bags, bottles, furniture),
not faces or people specifically.

## Quick start

```bash
npx expo install @rbayuokt/expo-background-removal
npx expo prebuild        # regenerates ios/ and android/, runs pod install
npx expo run:ios         # or run:android
```

Autolinking picks the module up from the scope on its own. Note the Gradle project is
named after the scope too, so an Android task is
`:rbayuokt-expo-background-removal:compileDebugKotlin`.

There is native code here, so it does not run in Expo Go. Use a development build.

If your app already has an `ios/` directory, `expo run:ios` will not pick up the new pod
on its own: CocoaPods is driven by prebuild, not by `run`. Run `npx expo prebuild` or
`npx pod-install` once after installing.

```ts
import { removeBackground } from '@rbayuokt/expo-background-removal';

const { uri, width, height } = await removeBackground(asset.uri);
```

## API

```ts
removeBackground(uri: string, options?: RemoveBackgroundOptions): Promise<RemoveBackgroundResult>
segmentImage(uri: string, options?: ProcessOptions): Promise<SegmentationResult>
extractObjects(uri: string, options?: ProcessOptions): Promise<ExtractedObject[]>
toPng(uri: string, options?: ProcessOptions): Promise<RemoveBackgroundResult>

<BackgroundRemovalView source={uri} highlightSubjects onSubjects={…} />
```

`removeBackground` merges every detected subject into one PNG. `cropToSubject` (default
`false`) keeps the original canvas and sets background pixels to alpha 0; set it to
`true` to crop to the subject bounds instead.

`segmentImage` returns two files from one segmentation pass: `foregroundUri` with the
subject on transparency, `backgroundUri` with the subject punched out.

`extractObjects` returns one cropped PNG per detected subject. Both platforms do real
instance separation, so three objects in frame give three files.

`toPng` runs the decode half of the pipeline on its own: it reads any format the OS
supports, bakes in the EXIF orientation and writes a PNG. Reach for it when something
downstream is pickier than the OS. Skia is the usual case, since it has no HEIF decoder
and iPhone photo libraries are full of HEIC.

`maxDimension` on either options object caps the longest edge before segmentation. Lower
values cut peak memory and time; thin edges (hair, straps, cables) lose detail.

## BackgroundRemovalView

Apple's own subject lifting, through VisionKit's `ImageAnalysisInteraction`. Long press a
subject on iOS 17+ and it lifts out with the system glow, the same gesture Photos uses.
Setting `highlightSubjects` plays that highlight animation without a gesture, and
`onSubjects` reports how many the system found.

```tsx
<BackgroundRemovalView
  source={asset.uri}
  highlightSubjects={glow}
  onSubjects={(event) => setCount(event.nativeEvent.count)}
  style={{ width, height }}
/>
```

This is a live view, not a file producer: it never writes a PNG. Use `removeBackground()`
when you need an image on disk. On Android there is no equivalent API, so the view renders
the image and ignores `highlightSubjects`, which keeps the JSX identical on both platforms.

## Input and output

Input is a local `file://` URI on both platforms, plus `content://` on Android, which is
what the system photo picker usually returns. JPEG, PNG, WebP and HEIC/HEIF decode
wherever the OS supports them. EXIF orientation is normalised before segmentation, so a
portrait iPhone photo comes back upright rather than rotated or mirrored.

Output is always a PNG with a real alpha channel, written to
`<cache>/background-removal/<uuid>.png`. Files are not deleted automatically. Move
anything you want to keep out of the cache directory.

## Errors

Failures reject with a `code` on the error object:

| Code | When |
| --- | --- |
| `INVALID_URI` | Not a `file://` URI, or an unsupported scheme |
| `FILE_NOT_FOUND` | Nothing at that path, or the content stream could not be opened |
| `INVALID_IMAGE` | The file is not a decodable image |
| `UNSUPPORTED_OS` | iOS below 17, or web |
| `NO_SUBJECT_FOUND` | The model found no foreground subject |
| `SEGMENTATION_FAILED` | The model ran and failed |
| `IMAGE_RENDER_FAILED` | Masking or compositing failed |
| `IMAGE_WRITE_FAILED` | The PNG could not be written |

```ts
try {
  await removeBackground(uri);
} catch (error) {
  if (error.code === 'NO_SUBJECT_FOUND') {
    // ask for a different photo
  }
}
```

## Platform notes

| | iOS | Android |
| --- | --- | --- |
| Minimum | iOS 17 | API 24 |
| Engine | Vision, `VNGenerateForegroundInstanceMaskRequest` | ML Kit Subject Segmentation 16.0.0-beta1 |
| Model | On device, part of the OS | Downloaded through Google Play services |
| Simulator | Not supported, the request has no CPU path | Emulator works with Play services |

The ML Kit API is still beta and the model is unbundled, so the first call on a device
can fail until Play services has fetched it. The module declares the
`com.google.mlkit.vision.DEPENDENCIES` manifest hint so the download starts at install
time.

On iOS below 17 every call rejects with `UNSUPPORTED_OS`. The podspec floor is 15.1, so
the module installs into any modern Expo app without forcing its deployment target up.
Everything that touches Vision is behind `@available(iOS 17.0, *)`.

## Toolchain

The example pins **Expo SDK 55** (`expo ~55.0.31`, React Native 0.83.10). SDK 56 and 57
ship `expo-modules-jsi` written with `weak let`, a Swift 6.3 feature, so building them
from source needs an Xcode with Swift 6.3.1 or newer. SDK 55 compiles on Swift 6.2.1
(Xcode 26.1), which is what this repo is verified against:

```
ExpoBackgroundRemoval pod        BUILD SUCCEEDED
expobackgroundremovalexample     BUILD SUCCEEDED
:@rbayuokt/expo-background-removal:compileDebugKotlin   BUILD SUCCESSFUL
```

Nothing in the module's own Swift or Kotlin is SDK 55 specific, so raise the example once
your Xcode is new enough.

## The reveal effect

The particle effect ships with the package, behind its own entry point so the main entry
stays free of Skia:

```bash
npx expo install @shopify/react-native-skia react-native-reanimated
```

```tsx
import { SubjectReveal } from '@rbayuokt/expo-background-removal/effects';

<SubjectReveal source={asset.uri} style={{ width: 340, height: 400 }} />
```

That one component does the whole sequence: normalise the photo through `toPng`, run
`segmentImage`, sweep a scan across it while that runs, then bloom the subject and turn
the background into particles. It measures itself, so give it a size and nothing else.

```tsx
const reveal = useRef<SubjectRevealHandle>(null);

<SubjectReveal ref={reveal} source={uri} autoPlay={false} duration={2600} glow style={…} />

reveal.current?.play();    // background away
reveal.current?.snap();    // subject too
reveal.current?.reset();   // back to the photo
```

`Disintegrate` and `Scanner` are exported as well, for driving the layers from your own
shared values.

Both libraries are **optional peer dependencies**: install them only if you import
`/effects`. Nothing in the main entry references them, so `removeBackground()` on its own
adds no Skia to your bundle.

One version trap worth knowing: Reanimated 4.2.x needs `react-native-worklets` 0.7.x, and
`expo install` may resolve 0.8.x, which fails at `pod install` with "Failed to validate
worklets version". Pin it if you hit that.

## Threading

Every function is an Expo `AsyncFunction`, so nothing runs on the JS thread. iOS work
runs on a queue owned by this module rather than the shared Expo async queue. Android
work is a coroutine dispatched onto `Dispatchers.Default`, and ML Kit's `Task` is
awaited through `suspendCancellableCoroutine` rather than polled.

## Architecture

```text
src/                     TypeScript API and types
ios/
  ExpoBackgroundRemovalModule.swift    module definition, records, availability gate
  BackgroundRemovalProcessor.swift     decode, Vision, compositing, PNG
  BackgroundRemovalError.swift         error codes
android/src/main/java/expo/modules/backgroundremoval/
  ExpoBackgroundRemovalModule.kt       module definition, records, coroutine dispatch
  BackgroundRemovalProcessor.kt        URI resolution, decode, ML Kit, PNG
  BackgroundRemovalException.kt        error codes
src/effects/             optional Skia + Reanimated reveal, published as /effects
example/                 development app, autolinks the module from ..
```

The shape in one line: the module files only convert arguments and pick a queue, every
image byte stays inside the processor, and JavaScript only ever sees a URI and a size.

The iOS pipeline goes: `CGImageSource` decode with the EXIF transform baked in →
`VNImageRequestHandler` with `.up` → `VNGenerateForegroundInstanceMaskRequest` →
`VNInstanceMaskObservation.allInstances` minus index 0 → `generateMaskedImage` →
`CIContext.writePNGRepresentation` as RGBA8.

The Android pipeline goes: resolve `content://` to a cache file → bounds decode →
`inSampleSize` → exact scale → EXIF matrix → `SubjectSegmentation` → foreground bitmap
or per subject bitmaps → `Bitmap.compress` as PNG.

## Scripts

| Command | Does |
| --- | --- |
| `npm run build` | Compile `src/` to `build/`, in watch mode when interactive |
| `npm run prepare` | One-shot rebuild of `build/`, what the example scripts call |
| `npm run clean` | Remove `build/` |
| `npm run lint` | ESLint over `src/` |
| `npm run test` | Jest |
| `npm run example:ios` | Build the module, install the example, run it on iOS |
| `npm run example:android` | Same for Android |
| `npm run open:ios` | Open `example/ios` in Xcode |
| `npm run open:android` | Open `example/android` in Android Studio |

## Example app

From a fresh clone, one command from the repo root:

```bash
npm install             # builds build/ through the prepare script
npm run example:ios     # or example:android
```

Or from inside `example` itself:

| Command | Does |
| --- | --- |
| `npm run setup` | Build the module, then install the example's dependencies |
| `npm run ios` | Rebuild the module, then `expo run:ios` |
| `npm run android` | Rebuild the module, then `expo run:android` |
| `npm start` | Metro only, for JS-only changes |

Every native script runs the module's one-shot `prepare` build first, so the example can never run against a
stale copy of the module's JavaScript.

The example depends on the module as `"@rbayuokt/expo-background-removal": "file:.."`, which is
what puts it in `node_modules` for autolinking and Metro to find. `example/ios` and
`example/android` are not committed, so the first run regenerates them with prebuild,
which also installs pods. Nothing in there is hand written, so
`npx expo prebuild --clean` inside `example` is always safe: the module's native code
lives in `ios/` and `android/` at the repo root.

`example/App.tsx` picks an image with `expo-image-picker`, normalises it through `toPng`
so every layer is Skia-loadable, and runs all three functions.

`removeBackground` and `segmentImage` results render through the package's own
`Disintegrate`, a Skia canvas that turns the background into particles and leaves the
subject standing.

Four layers: a blurred copy of the plate at the bottom so the end state is soft rather
than a hole, the sharp background above it running an SkSL shader, a bloom that flashes
around the silhouette, and the cutout subject on top. The bloom is a zero-offset drop
shadow with `shadowOnly`, so it is the halo alone with no second copy of the subject in
it; its blur grows as its opacity falls, which is what makes it read as a pulse rather
than a rim. It leads the dissolve by 260ms. The shader sweeps a front down the image, and behind that front each 2px grain is
dropped at its own random moment, so the plate breaks into fine speckle instead of fading
as a sheet. Surviving grains lift slightly and glint before they go. The subject layer
runs the same shader on its own uniform, which is what the Snap button drives.

The only uniform, `progress`, is a Reanimated shared value driven by `withTiming`, so the
whole animation runs on the UI thread.

That effect only works because `segmentImage()` hands back the foreground and background
as separate layers with real alpha. The module itself has no Skia or Reanimated
dependency; those live in the example.

There is also a **Snap demo (no segmentation)** button that runs the shader straight on
the picked photo. It needs no model, so the animation can be checked on the iOS
Simulator, where Vision cannot run.

The **Apple subject lift** switch swaps the whole stage for `BackgroundRemovalView`, so
you can compare the system effect against the shader. Skia is only needed for the shader
half; the native view has no dependencies at all.

---

Created by [@rbayuokt](https://github.com/rbayuokt), made with ❤️ and 🎵
