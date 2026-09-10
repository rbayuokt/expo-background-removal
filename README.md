# @rbayuokt/expo-background-removal

Cut the subject out of a photo on device and get back a transparent PNG. Point it at a
local image, it runs the platform's own segmentation model, writes the result into the app
cache directory and hands JavaScript a `file://` URI. No pixels, masks or base64 cross the
bridge.

iOS uses Vision's `VNGenerateForegroundInstanceMaskRequest`. Android uses ML Kit Subject
Segmentation. Both target general objects (shoes, bags, bottles, furniture), not faces or
people specifically, and both return separate instances when there is more than one
subject in frame.

## Install

```bash
npx expo install @rbayuokt/expo-background-removal
npx expo prebuild        # regenerates ios/ and android/, runs pod install
npx expo run:ios         # or run:android
```

There is native code here, so it does not run in Expo Go. Use a development build.

If your app already has an `ios/` directory, `expo run:ios` will not pick up the new pod
on its own: CocoaPods is driven by prebuild, not by `run`. Run `npx expo prebuild` or
`npx pod-install` once after installing.

Autolinking finds the module from the scope on its own. The Gradle project is named after
the scope too, so an Android task is `:rbayuokt-expo-background-removal:compileDebugKotlin`.

## Usage without the effect

Pick a photo, cut the subject out, show it:

```tsx
import { removeBackground } from '@rbayuokt/expo-background-removal';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
if (!picked.canceled) {
  const { uri, width, height } = await removeBackground(picked.assets[0].uri);
  return <Image source={{ uri }} style={{ width: 300, height: 300 }} resizeMode="contain" />;
}
```

That is the whole surface for the common case. The PNG is on disk with real alpha, ready
to upload, save or composite.

## Usage with the effect

The particle reveal ships in the package behind its own entry point:

```bash
npx expo install @shopify/react-native-skia react-native-reanimated
```

```tsx
import { SubjectReveal } from '@rbayuokt/expo-background-removal/effects';

<SubjectReveal source={picked.assets[0].uri} style={{ width: 340, height: 400 }} />
```

One component does the whole sequence: normalise the photo through `toPng`, run
`segmentImage`, sweep a scan across it while that runs, then bloom the subject and turn
the background into particles. It measures itself, so give it a size and nothing else.

To drive it by hand:

```tsx
const reveal = useRef<SubjectRevealHandle>(null);

<SubjectReveal ref={reveal} source={uri} autoRun={false} duration={2600} style={...} />

reveal.current?.run();     // segment now
reveal.current?.play();    // background away
reveal.current?.snap();    // subject too
reveal.current?.reset();   // back to the photo
```

| Prop | Default | Does |
| --- | --- | --- |
| `source` | required | Local image URI, any format the OS decodes |
| `result` | none | A `segmentImage()` output to reveal instead of segmenting again |
| `busy` | `false` | Show the scan while the app runs its own call |
| `autoRun` | `true` | Segment as soon as `source` is set |
| `autoPlay` | `true` | Play as soon as the layers decode |
| `duration` | `2600` | Dissolve length in ms |
| `maxDimension` | `1600` | Longest edge before segmentation |
| `fit` | `contain` | `cover` bleeds to the edges and crops |
| `glow` | `true` | Warm bloom around the subject |
| `onReady` | | Fires with the `segmentImage()` result |
| `onRevealed` | | Fires when the background has finished crumbling |
| `onError` | | Fires with a coded error |

`result` and `busy` go together when the app drives the calls itself: pass `busy` while
your own `segmentImage()` runs so the scan starts on the tap, then pass the result. Without
`busy` the component sits idle, since `autoRun={false}` never starts its own pipeline.

`Disintegrate` and `Scanner` are exported as well, for driving the layers from your own
shared values.

Skia and Reanimated are **optional peer dependencies**. Nothing in the main entry
references them, so `removeBackground()` on its own adds no Skia to your bundle.

One version trap: Reanimated 4.2.x needs `react-native-worklets` 0.7.x, and `expo install`
may resolve 0.8.x, which fails at `pod install` with "Failed to validate worklets version".

## API

```ts
removeBackground(uri: string, options?: RemoveBackgroundOptions): Promise<RemoveBackgroundResult>
segmentImage(uri: string, options?: ProcessOptions): Promise<SegmentationResult>
extractObjects(uri: string, options?: ProcessOptions): Promise<ExtractedObject[]>
toPng(uri: string, options?: ProcessOptions): Promise<RemoveBackgroundResult>

<BackgroundRemovalView source={uri} highlightSubjects onSubjects={…} />
```

`removeBackground` merges every detected subject into one PNG. `cropToSubject` (default
`false`) keeps the original canvas and sets background pixels to alpha 0; set it to `true`
to crop to the subject bounds instead.

`segmentImage` returns two files from one segmentation pass: `foregroundUri` with the
subject on transparency, `backgroundUri` with the subject punched out. Reach for it when
you need both halves, such as replacing or blurring a background. It is also what the
reveal effect uses, since particles need a real background plate to eat.

`extractObjects` returns one cropped PNG per detected subject. Both platforms do real
instance separation, so three objects in frame give three files.

`toPng` runs the decode half of the pipeline on its own: it reads any format the OS
supports, bakes in the EXIF orientation and writes a PNG. Reach for it when something
downstream is pickier than the OS. Skia is the usual case, since it has no HEIF decoder
and iPhone photo libraries are full of HEIC.

`maxDimension` on either options object caps the longest edge before segmentation. Lower
values cut peak memory and time; thin edges (hair, straps, cables) lose detail.

## BackgroundRemovalView

Apple's own subject lifting, through VisionKit's `ImageAnalysisInteraction`. Press and hold
a subject on iOS 17+ and it lifts out with the system glow, the same gesture Photos uses.
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
what the system photo picker usually returns. JPEG, PNG, WebP and HEIC/HEIF decode wherever
the OS supports them. EXIF orientation is normalised before segmentation, so a portrait
iPhone photo comes back upright rather than rotated or mirrored.

Output is always a PNG with a real alpha channel, written to
`<cache>/background-removal/<uuid>.png`. Files are not deleted automatically. Move anything
you want to keep out of the cache directory.

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
| Simulator | Not supported, the request has no CPU path | Emulator works if the image has Play services |

On iOS below 17 every call rejects with `UNSUPPORTED_OS`. The podspec floor is 15.1, so the
module installs into any modern Expo app without forcing its deployment target up.
Everything that touches Vision is behind `@available(iOS 17.0, *)`.

The ML Kit API is still beta and the model is unbundled, so the first call on a device can
fail until Play services has fetched it. The module declares the
`com.google.mlkit.vision.DEPENDENCIES` manifest hint so the download starts at install time.

Its whole-frame outputs, `foregroundBitmap` and `foregroundConfidenceMask`, shear the image
on some devices and can segfault inside its native code:

```
Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x7deba00000
  com.google.mlkit.vision.segmentation.subject.internal.zzj.zze
```

The per-subject bitmaps are unaffected, so both halves are composed from those: each
subject is drawn onto a transparent canvas for the foreground, and punched out of a copy of
the original with `PorterDuff.Mode.DST_OUT` for the background. That also makes the two
halves exact complements.

Edge quality still differs. Vision runs a heavier model on the Neural Engine; ML Kit is
tuned for roughly 200ms on a Pixel 7 Pro. Hair and fur are where the gap shows. ML Kit also
merges subjects that touch, and targets objects, pets and humans only.

## Threading

Every function is an Expo `AsyncFunction`, so nothing runs on the JS thread. iOS work runs
on a queue owned by this module rather than the shared Expo async queue. Android work is a
coroutine dispatched onto `Dispatchers.Default`, and ML Kit's `Task` is awaited through
`suspendCancellableCoroutine` rather than polled.

## Architecture

```text
src/                     TypeScript API and types
src/effects/             optional Skia and Reanimated reveal, published as /effects
ios/
  ExpoBackgroundRemovalModule.swift    module definition, records, availability gate
  BackgroundRemovalProcessor.swift     decode, Vision, compositing, PNG
  ExpoBackgroundRemovalView.swift      VisionKit subject lifting
  BackgroundRemovalError.swift         error codes
android/src/main/java/expo/modules/backgroundremoval/
  ExpoBackgroundRemovalModule.kt       module definition, records, coroutine dispatch
  BackgroundRemovalProcessor.kt        URI resolution, decode, ML Kit, PNG
  ExpoBackgroundRemovalView.kt         image only, no lifting on Android
  BackgroundRemovalException.kt        error codes
example/                 development app, links the module with file:..
```

The shape in one line: the module files only convert arguments and pick a queue, every
image byte stays inside the processor, and JavaScript only ever sees a URI and a size.

The iOS pipeline goes: `CGImageSource` decode with the EXIF transform baked in →
`VNImageRequestHandler` with `.up` → `VNGenerateForegroundInstanceMaskRequest` →
`VNInstanceMaskObservation.allInstances` minus index 0 → `generateMaskedImage` →
`CIContext.writePNGRepresentation` as RGBA8.

The Android pipeline goes: resolve `content://` to a cache file → bounds decode →
`inSampleSize` → exact scale → EXIF matrix → `SubjectSegmentation` → compose the subject
bitmaps → `Bitmap.compress` as PNG.

## The reveal effect

`example/App.tsx` renders results through the package's own `Disintegrate`, a Skia canvas
that turns the background into particles and leaves the subject standing.

Four layers: a blurred copy of the plate so the end state is soft rather than a hole, the
sharp plate above it running an SkSL shader, a bloom that flashes around the silhouette,
and the cutout on top. The bloom is a zero-offset drop shadow with `shadowOnly`, so it is
the halo alone with no second copy of the subject in it; its blur grows as its opacity
falls, so it reads as a pulse rather than a rim. The subject scales 4.5% with it and
settles back, which gives the pop. It leads the dissolve by 260ms.

The scan stays on screen until the canvas has decoded, and brightens rather than dims, so
the handover between the two has no step in it.

The shader sweeps a front down the image, and behind that front each 2px grain is dropped
at its own random moment, so the plate breaks into fine speckle instead of fading as a
sheet. The only uniform, `progress`, is a Reanimated shared value driven by `withTiming`,
so the whole animation runs on the UI thread.

## Toolchain

The example pins **Expo SDK 55** (`expo ~55.0.31`, React Native 0.83.10). SDK 56 and 57
ship `expo-modules-jsi` written with `weak let`, a Swift 6.3 feature, so building them from
source needs an Xcode with Swift 6.3.1 or newer. SDK 55 compiles on Swift 6.2.1
(Xcode 26.1), which is what this repo is verified against.

Nothing in the module's own Swift or Kotlin is SDK 55 specific, so raise the example once
your Xcode is new enough.

## Scripts

| Command | Does |
| --- | --- |
| `npm run build` | Compile `src/` to `build/`, in watch mode when interactive |
| `npm run prepare` | One-shot rebuild of `build/`, what the example scripts call |
| `npm run clean` | Remove `build/` |
| `npm run lint` | ESLint over `src/` |
| `npm run test` | Jest |
| `npm run example:ios` | Install the example and run it on iOS |
| `npm run example:android` | Same for Android |
| `npm run example:prebuild` | Regenerate the example's native projects |
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
| `npm run prebuild` | Regenerate `ios/` and `android/`, and install pods |
| `npm run prebuild:clean` | Delete them first, then regenerate |
| `npm run ios` | Rebuild the module, then `expo run:ios` |
| `npm run android` | Rebuild the module, then `expo run:android` |
| `npm start` | Metro only, for JS-only changes |

Every native script runs the module's one-shot `prepare` build first, so the example can
never run against a stale copy of the module's JavaScript.

The example depends on the module as `"@rbayuokt/expo-background-removal": "file:.."`,
which is what puts it in `node_modules` for autolinking and Metro to find. `example/ios`
and `example/android` are not committed, so the first run regenerates them with prebuild,
which also installs pods.

The app takes a photo or picks one from the library, normalises it through `toPng` so every
layer is Skia-loadable, and runs each call from a sheet. Results appear as specimens on a checkerboard, and each call
logs its timing to the console.

Vision needs a real device: the request has no CPU path, so `removeBackground()` on the iOS
Simulator always rejects with `SEGMENTATION_FAILED`.

## When to rebuild

Editing Swift or Kotlin inside the module needs a native build, not a Metro reload:

```bash
cd example
npm run ios          # or npm run android
```

Adding or removing a native file also needs `npx pod-install` before that build. The
podspec's `source_files` glob is resolved at install time, so Xcode will not see a new
`.swift` until pods are reinstalled.

Changing `example/app.json` needs a prebuild, since that is what writes `Info.plist`, the
Android manifest and the Podfile:

```bash
cd example
npm run prebuild         # regenerates ios/ and android/, runs pod install
npm run prebuild:clean   # deletes them first
```

Or `npm run example:prebuild` from the repo root. `prebuild:clean` is always safe here.
`example/ios` and `example/android` are generated output and are not committed, and the
module's own native code lives in `ios/` and `android/` at the repo root, which prebuild
never touches.

JavaScript changes need neither: `npx expo start -c` is enough.


---

Created by [@rbayuokt](https://github.com/rbayuokt), made with ❤️ and 🎵
