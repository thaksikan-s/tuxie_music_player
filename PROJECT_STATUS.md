# Project status

## Tuxie v2.0.0.0 — current build, 2026-10-13

- Rebuilt the phone interface around a permanent black/red liquid-glass system: connected Home/Library/Settings controls, a separate search lens, artwork-led player, liquid rails, glossy transport controls, and a system-reduced-motion fallback.
- Android device music now auto-indexes to completion in bounded 200-song bridge pages. The internal page size is no longer a library ceiling; the UI grows its song window automatically while scrolling. Browser-picked imports remain foreground-only by platform limitation.
- Added local WebView failure breadcrumbs, shared/tested library-merge state, foreground-safe native queue/command dispatch, and Media3 error pausing to leave a recoverable session after a bad file.
- Passed JavaScript syntax checks, Node library-state tests, Capacitor sync, Gradle `testDebugUnitTest`, and `assembleDebug`. The debug APK is `release/android/TUXIE v2.0.0.0.apk`, package `com.tuxie.musicplayer`, versionName `2.0.0.0`, versionCode `2000000`, min SDK 23, target SDK 35, signed with the Android debug certificate (v1/v2 verified).
- No Android device is presently attached. USB runtime testing—especially lock screen, notification, widget, Bluetooth/headphone events, scan beyond 200 songs, and reproduction of the reported crash—remains required before calling this build stable.

## V1.0.0 hardening — current verification, 2026-10-12

- Android launcher label, Capacitor display name, and browser title are **Tuxie Music Player**. Package ID remains `com.tuxie.musicplayer`, version name `1.0.0`, version code `1`; `com.veylora.music` remains a separate app.
- Added a native Android home-screen widget backed by the existing Media3 service, with artwork/title/artist, transport actions, tap-to-open, and event-driven refresh. Widget action handling avoids starting an empty foreground service after playback has stopped.
- Separated media-library and optional notification permission flows; added notification-permission and app-settings actions. Added a combined playback/system-volume snapshot, fixed-volume handling, transient polling retry, and unit tests for volume conversion.
- `node --check`, Android XML/config validation, `npm.cmd run android:sync`, and Gradle `testDebugUnitTest assembleDebug assembleRelease` passed. Browser verification played the already-imported real MP3 with advancing progress; Settings and 360×780 layout checks passed.
- Current debug APK: `release/android/Tuxie_V1.0.0.0.apk` — 23,248,057 bytes; SHA-256 `D140D27777653510A74E1F863ABC6839182140AC62249C5C3885A7C49D10D32E`. The unsigned release APK is 14,265,474 bytes; SHA-256 `14B9A064329635D8263F6DA6D90F730331E4169E027C0219EE3058F93D23771F`; it is not distributable until signed with an owner-controlled key.
- No Android device/emulator was attached. Native playback/crash recovery, MediaStore permission/scanning beyond 200 tracks, system volume/hardware buttons, notification and lock-screen actions, widget runtime, background playback, Bluetooth/headphone interruptions, and process recovery remain unverified on hardware. Hardware media-volume state is read while the app is visible; no native push listener exists.
- A scoped source backup is stored outside the project at `C:\Users\Thaksi\.copilot\session-state\6030a04b-5512-4997-adcf-98f8449be017\backups\tuxie-v1-source-20261012-213952.zip`. No signing secrets or keys were added.

## Playback debugging rebuild — 2026-10-12

Historical snapshot; superseded by the V1.0.0 hardening verification above.

- The Android app still requests MediaStore results in pages of 200; the web song list intentionally renders a maximum of 60 rows at a time. Moved the visible next-page action/status above the list and show how many device tracks remain, so the 200-song page boundary is discoverable.
- Added Media3 playback error logging and state reporting, validation for Android `content://` URIs, and defensive service-start/queue exception handling in the Capacitor bridge. The UI now surfaces newly reported Media3 playback errors.
- Refined the mobile home carousel with larger artwork-led cards and layered red/black glass borders and surfaces, guided by the supplied screen recording; preserved the existing branding and portrait source.
- `node --check` passed for `app.js`, `offline-ui.js`, and `scripts/prepare-web.mjs`. `npm.cmd run android:sync` and Gradle `assembleDebug` passed. `aapt` confirmed ID `com.tuxie.musicplayer`, label **Tuxie**, version 1.0.0/code 1, target SDK 35, and minimum SDK 23; `apksigner` verified v1 and v2 signatures.
- Current artifact: `release/android/Tuxie_V1.0.0.0.apk` — 23,246,183 bytes; SHA-256 `48ABE3CF1CB3173FF44A729867DEDC13AB54E5293843E89F3B1D980C64D06C14`.
- Browser verification played the already-imported real MP3 and observed playback progress; at 360×780 the document had no horizontal overflow and the floating mini-player/navigation remained inside the viewport.
- No ADB device or emulator was attached. The APK was not installed on a phone; MediaStore permissions, scanning past 200 tracks, and native playback/crash recovery have not been device-tested. The reported crash's root cause remains unknown until Android logcat is captured. Defensive error reporting does not prove the crash is fixed.

## Previous stability rebuild update — 2026-10-12 (historical)

The following records the baseline before the playback-debugging rebuild above.

- Android application ID remains `com.tuxie.musicplayer`; the launcher label is exactly **Tuxie**. The earlier `com.veylora.music` package remains separate.
- The MediaStore plugin now returns bounded pages (200 at a time), has native title/artist/album search, and can resolve saved Android queue IDs during startup recovery. The web library uses 60-row slices and debounced search rather than repainting the whole page on each keystroke.
- Queue items are shown in a dedicated page with move-up/down controls, drag reordering, and removal. Full-player dismissal now interpolates drag progress and supports cancellation/velocity threshold; swipe starts only on the handle or artwork, avoiding the controls and detail scroller.
- The native-track equaliser action is explicitly unavailable; the browser equaliser remains limited to Web Audio tracks. Scan status and search empty/error states are exposed in the UI.
- Launcher density icons were regenerated as square portrait compositions from `assets/branding/tuxie-avatar-512.jpg`; the portrait source was not changed. Adaptive foreground/background resources remain in place.
- JavaScript syntax checks passed. `npm.cmd run android:sync` passed. The Android Gradle `assembleDebug` build passed; `aapt` confirmed ID `com.tuxie.musicplayer`, label **Tuxie**, version 1.0.0/code 1, target SDK 35, and minimum SDK 23. `apksigner` verified the debug APK's v1 and v2 signatures.
- Current artifact: `release/android/tuxie-music-debug.apk` — 23,246,183 bytes; SHA-256 `B63BA6C3E115550C802C1A08E557B01E513EEA3916D08E105312BBEFBF1394F0`.
- Browser verification covered the imported real MP3, search, mini-player/full-player expansion, drag-progress collapse, and a 320×700 viewport without horizontal overflow. No ADB device or emulator was connected; no Android install, MediaStore, permission, native playback, notification, or background behavior was verified.
- Android Studio is not needed for this command-line build. The installed Node.js, JDK 21, Android SDK Platform 35, Build-Tools, and project Gradle wrapper are available. PowerShell policy was not changed.

## Stability rebuild plan and initial diagnosis — 2026-10-12

The supplied 33-second, 860×1920 H.264 screen recording was sampled at one-second intervals. It demonstrates Home, Library and Settings screens, album browsing, a persistent bottom mini-player/navigation, and a full-screen player with artwork-derived blurred color, a seek bar, transport, volume, and utility actions. The square 512×512 Tuxie portrait asset was inspected; preserve its square composition for launcher artwork rather than applying a circular crop. These are references, not branding to reproduce.

Initial implementation risks found before changes:

- `app.js` is a roughly 104 KB global script; `offline-ui.js` replaces several of its functions after loading. Playback, UI, persistence, importing, and native bridge behavior are therefore coupled and have multiple implementations to reconcile.
- Track rows, carousels, and queue rows are generated with complete `innerHTML` replacements. Android MediaStore returns its entire cursor as one JS array, so large device libraries can incur large bridge transfers and DOM work.
- The full-player dismissal currently relies on touch start/end detection, not drag-progress interpolation; rapid gestures and content scrolling can compete with it.
- The Android media session/Media3 service and MediaStore bridge compile, but previous reports record no device/emulator runtime test. Continue treating native runtime behavior as unverified until tested.
- The attached recording is a 33-second visual reference; it does not provide evidence about this app's playback correctness or stability.

Implementation stages:

1. **Identity and baseline:** use the exact Android launcher label `Tuxie`; inspect and retain the existing square logo composition; capture current build/device/test availability and preserve current supported screens.
2. **Stability and responsiveness:** correct playback/queue/state edge cases; reduce large-library work with bounded list rendering and search debounce; make permission, missing-file, and playback errors explicit. Do not fabricate catalog content or claim unsupported features.
3. **Glass and motion:** refine the existing red/black glass surfaces to the reference's deeper artwork-led player and compact persistent controls; implement cancellable drag-progress collapse/expand with scroll/gesture guards and reduced-motion/accessibility support.
4. **Verification and release:** run focused JS checks, synchronize Capacitor assets, build and inspect the debug APK at `release/android/tuxie-music-debug.apk`, then record exact artifact/version/signature/device-test evidence and remaining limitations.

Keep each stage buildable, preserve the app ID `com.tuxie.musicplayer`, and do not change the source portrait or introduce filler dependencies/assets. This is a plan, not a claim that the items above are complete.

## Current target

Tuxie Music Player is an offline-first HTML/CSS/JavaScript music player configured for Android packaging through Capacitor. The existing library, playback, metadata, queue, playlists, equaliser, and lyrics implementation is preserved. The offline presentation filters playable songs to imported local audio.

The Capacitor application ID is `com.tuxie.musicplayer`; the Android launcher label is **Tuxie**. The earlier `com.veylora.music` identity remains separate; Android treats the two IDs as different apps, so neither updates nor migrates the other.

## Implemented in source

- Rebranded the browser title, web manifest, Capacitor app ID (`com.tuxie.musicplayer`), display name, package metadata, navigation, settings, About view, profile avatars, README, and release documentation. Legacy identity is mentioned only in migration notes.
- Preserved the supplied original portrait at `assets/branding/tuxie-logo.webp`; generated a 512px avatar, a 720×960 About portrait, a browser icon, adaptive-icon foreground, density-specific Android launcher icons, and a 1080×1920 splash image.
- Added an Android resource application script (`npm run android:branding`) that installs the generated icons, app label, and splash resource after Capacitor creates the native project.
- Configured the Capacitor SplashScreen plugin with a near-black background and added it as an app dependency.
- Added mobile swipe navigation, mini-player swipe-up expansion, Now Playing horizontal track swipes and downward dismissal, CSS page transitions, and an artwork scale transition when opening the full player. These honor reduced-motion preferences and do not depend on the View Transition API.
- Expanded the layered red-black glass surfaces across navigation, player, settings, search, album cards, queue items, and dialogs, with blur fallbacks and reduced-motion handling.
- Kept Android local selection on the WebView system file picker and local audio on the shared HTML audio engine. Android-specific playback behavior is still unverified.
- Added a Capacitor `TuxiePlayback` bridge, MediaStore audio scan with Android-version-specific permission requests, lazy 320px album-art retrieval, system `STREAM_MUSIC` volume access, and native queue/mode/seek commands.
- Added a Media3 1.5.1 ExoPlayer `MediaSessionService`, playlist queue, foreground media-playback declaration, system media notification/session, audio-focus configuration, and headphone-unplug handling. Web UI controls and status polling are connected for Android MediaStore tracks; WebView-picked files remain on HTML Audio.
- Routed Android MediaStore tracks through the native bridge instead of the browser audio fallback. Saved track, queue, position, and play/pause state are used in a startup recovery attempt; this process-restart path is not device-tested.
- Set package/app version to 1.0.0 (versionCode 1). The original portrait source was not modified.
- Updated Capacitor web staging to include the optimized Tuxie images used in the app.

## Verification performed for this update

- Verified the supplied WebP source is 768×1024 and copied it without alteration into `assets/branding/tuxie-logo.webp`.
- Generated optimized avatar, icon foreground, launcher icon, and splash artwork variants; visually checked the crops and confirmed the face remains recognizable.
- In the integrated browser, confirmed the Tuxie title and home branding render, the avatar loads at 512px, and the About portrait loads at 720×960.
- Replayed the existing imported MP3 in the browser: duration was 47.76 seconds, playback advanced by about 0.83 seconds with no media error, and pause worked. This remains a browser/WebView-engine check, not Android-device validation.
- Exercised Home-to-Library touch navigation, mini-player expansion, and downward swipe dismissal of Now Playing. The player artwork loaded at 500px and no console/page errors occurred in the final motion/gesture checks.
- Checked 320×700 and 390×844 layouts: document width matched the viewport, mini-player/navigation retained an 11px gap, and after scrolling the final song row stayed above the floating player.
- Installed Node.js 24.20.0/npm 11, Temurin JDK 21.0.12, official Android command-line tools, SDK Platform 35, and Platform-Tools 37.0.1. Gradle 8.11.1 is supplied by the project wrapper; Gradle downloaded Build-Tools 34.0.0 for this build.
- Installed and synchronized Capacitor Android 7.6.9 with `npm.cmd run android:add` and `npm.cmd run android:sync`; generated native project uses application ID `com.tuxie.musicplayer`, compile/target SDK 35, and min SDK 23.
- `node --check app.js`, `node --check offline-ui.js`, `node --check scripts/prepare-web.mjs`, and package/lock version consistency checks passed.
- `npm.cmd run android:sync` passed. `.\gradlew.bat assembleDebug assembleRelease` passed after correcting a missing Capacitor permission-callback import.
- `aapt` confirmed package `com.tuxie.musicplayer`, label **Tuxie Music Player**, version 1.0.0/code 1, target SDK 35, min SDK 23, and the Media3 service and permission declarations. Debug APK v1/v2 signatures passed `apksigner`.
- Debug APK: `release/android/TuxieMusicPlayer-debug.apk`, 22,875,979 bytes, SHA-256 `2CF88A134546BF257C5E73B74A1950D1E1ECBB75CD4AB7B1F3AE4A47D9298866`.
- Release APK: `release/android/TuxieMusicPlayer-1.0.0-release-unsigned.apk`, 14,268,861 bytes, SHA-256 `D8AF32107B316BD654879BDECC830492274F4D68341DF903934E58A2247031E8`; this build has no release key/signing config and is unsigned.
- Android Studio's winget installation failed to download, but the command-line SDK and wrapper successfully built the APK. The build reported an SDK XML version warning and standard Gradle `flatDir` warnings.
- PowerShell execution policy was not changed. `npm.ps1` is blocked on this machine; `npm.cmd` works. SDK/JDK paths are now saved in the user environment for new terminals.
- Browser preview reloaded and still listed the existing local MP3; this validates only the browser UI, not Android integration.
- `adb devices -l` found no connected phone or emulator. No APK installation, Android permission flow, MediaStore scan, or native playback test has been performed.

## Playback and platform limits

- The app's existing HTML audio playback, browser file import, and IndexedDB library remain in place; browser tests previously exercised a real local MP3 and responsive layouts.
- Android MediaStore tracks are wired to Media3 in a foreground media-session service. Background playback, lock-screen/system notification controls, audio focus, notification permission behavior, codec support, app suspension, calls/Bluetooth, service lifecycle, and MediaStore permissions are implemented in source but unverified on a device.
- Android system-volume APIs operate on `STREAM_MUSIC`; the app polls to synchronize the slider while visible. Hardware-button updates, route-specific behavior, and UI synchronization remain device-unverified.
- WebView-selected files still use HTML Audio and have no native background guarantee. Persistent Storage Access Framework grants, Android home-screen widget, and native Media3 equalizer are not implemented. Startup recovery for Android MediaStore playback is implemented in source but not device-tested.
- MediaStore access covers audio exposed by that provider, not every protected/private app folder. The release APK is unsigned; a protected signing key and release signing configuration are required.
- No cloud streaming, cloud uploads, signed APK/AAB, iOS package, Windows native package, or store publishing setup is included.

## Remaining Android verification

The debug APK is built and signature-verified, but has not been installed on a device. Connect an Android phone with USB debugging enabled (or start an emulator), then run:

```powershell
adb devices -l
adb install -r release\android\TuxieMusicPlayer-debug.apk
```

On the device, verify first-run permission requests, MediaStore discovery/rescan, actual MP3 playback, metadata/artwork, notification and lock-screen controls, background/locked playback, queue and seek, hardware-volume synchronization, audio focus, Bluetooth/headphone events, and lifecycle recovery. A home-screen widget, persistent folder grants, native equalizer, runtime process-restart recovery, and signed publishing release remain unimplemented or unverified.

See [README.md](./README.md) for prerequisites, commands, and package-ID implications.
