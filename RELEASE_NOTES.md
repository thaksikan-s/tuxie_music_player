# Release notes

## 2026-10-13 — Tuxie v2.0.0.0 liquid-glass device-test build

- Added a black/red liquid-glass UI system, reference-inspired core navigation, thicker glass sliders, and artwork-led Now Playing treatment.
- Device-library scans continue through all bounded pages; scrolling loads library rows automatically instead of exposing a 200-song ceiling.
- Added local diagnostics, tested library-state merging, foreground-safe Media3 command dispatch, and improved recovery after media playback errors.
- Package is `com.tuxie.musicplayer`, versionName `2.0.0.0`, versionCode `2000000`. `release/android/TUXIE v2.0.0.0.apk` is a debug-signed testing build; it is not a production/Play Store release.
- JS checks, Node tests, Capacitor sync, Android unit tests, debug build, package inspection, and v1/v2 signature verification passed. No device was connected for runtime validation.

## 2026-10-12 — V1.0.0 Android hardening and widget

- Set the launcher label, browser title, and Capacitor display name to **Tuxie Music Player**, retaining package `com.tuxie.musicplayer`, version 1.0.0/code 1.
- Added a native Android home-screen AppWidgetProvider backed by the existing Media3 service. The widget presents current artwork/title/artist, transport controls, and tap-to-open, and refreshes on playback state changes without polling.
- Separated audio-library permission from optional notification permission; added settings actions for notification access and app-permission recovery. Added a combined native playback/volume snapshot, fixed-volume device handling, resilient polling retries, and unit tests for volume conversion.
- Gradle `testDebugUnitTest assembleDebug assembleRelease`, JavaScript syntax checks, and Capacitor sync passed. Browser verification played the already-imported MP3 and observed advancing progress; Settings rendered and 360×780 had no horizontal overflow.
- Current debug APK: `release/android/Tuxie_V1.0.0.0.apk` — 23,248,057 bytes; SHA-256 `D140D27777653510A74E1F863ABC6839182140AC62249C5C3885A7C49D10D32E`. Current unsigned release APK: 14,265,474 bytes; SHA-256 `14B9A064329635D8263F6DA6D90F730331E4169E027C0219EE3058F93D23771F`.
- No Android device/emulator was connected. Native playback, lock-screen/background behavior, permissions, widget, and hardware/system-volume runtime behavior remain unverified. The release variant is unsigned and needs an owner-controlled key before distribution.

## 2026-10-12 — Android playback debugging build

Historical build record; APK evidence is superseded by the V1.0.0 hardening build above.

- Made Android library paging explicit before the bounded song list: the UI now reports loaded/remaining tracks and provides a visible next-200 action, addressing the hard-to-find pagination after an initial 200-track MediaStore scan.
- Added Android Media3 playback-error retention/logging and UI notifications, `content://` URI validation, and defensive exception handling around playback-service and queue startup.
- Refined the mobile carousel's artwork scale and glass card treatment from the supplied recording without changing Tuxie branding or the source portrait.
- JavaScript syntax checks, Capacitor sync, and `assembleDebug` passed. `aapt` verified package `com.tuxie.musicplayer`, label **Tuxie**, version 1.0.0, and SDK levels; `apksigner` verified v1/v2.
- Browser playback of the already-imported real MP3 advanced and reported progress; 360×780 viewport measurement found no horizontal overflow and confirmed the mini-player/navigation fit.
- Debug APK: `release/android/Tuxie_V1.0.0.0.apk` — 23,246,183 bytes; SHA-256 `48ABE3CF1CB3173FF44A729867DEDC13AB54E5293843E89F3B1D980C64D06C14`.
- No ADB device/emulator was connected. Physical Android playback, pagination beyond 200 on device, and the reported crash are unverified; capture `adb logcat` from the device if the crash persists. Do not treat defensive error reporting as proof the crash is fixed.

## 2026-10-12 — Stability and library performance update

- Set the Android launcher label to exactly **Tuxie** while retaining package ID `com.tuxie.musicplayer`; `com.veylora.music` is unchanged and remains a separate app.
- Replaced the round-framed launcher artwork with square, padded portrait-based density icons and adaptive icon resources. `assets/branding/tuxie-avatar-512.jpg` was not modified.
- Changed native MediaStore scanning to bounded 200-track pages; added native title/artist/album search and saved Android track-ID lookup for startup queue recovery. Library rendering is limited to 60 rows at a time and search is debounced.
- Added a queue screen with accessible move-up/down controls, drag reordering, remove, and clear operations. Added full-player drag-progress feedback, cancellation, velocity/threshold dismissal, and a defined handle/artwork start region.
- Made native Android Media3 equaliser unavailability explicit; browser Web Audio EQ remains available only for browser-audio tracks.
- JavaScript syntax checks, Capacitor web preparation/sync, and Android `assembleDebug` passed. `aapt` verified package, label, version, and SDK levels; `apksigner` verified the debug APK v1/v2 signatures.
- Browser checks played the already-imported real MP3, searched it, expanded/collapsed the full player with a live drag, and found no horizontal overflow at 320×700. No ADB device/emulator was present; Android installation and native runtime behavior are unverified.
- Current debug artifact: `release/android/tuxie-music-debug.apk` — 23,246,183 bytes; SHA-256 `B63BA6C3E115550C802C1A08E557B01E513EEA3916D08E105312BBEFBF1394F0`.

## 2026-10-12 — V1.0.0 native playback integration and APK builds

- Added Capacitor `TuxiePlayback` bridge and Media3 1.5.1 ExoPlayer `MediaSessionService`, MediaSession-based system notification/lock-screen integration, MediaStore scan, lazy album thumbnails, playback queue/modes/seek, and system STREAM_MUSIC volume bridge.
- Declared API-appropriate `READ_MEDIA_AUDIO` / legacy `READ_EXTERNAL_STORAGE`, notification permission, and media-playback foreground-service permissions. No broad all-files permission was added.
- Routed Android MediaStore selections through native playback rather than browser audio fallback. Saved track, queue, position, and playing state are used for a startup recovery attempt; playback polling checkpoints position every five seconds. This recovery is not device-tested.
- Set package version to 1.0.0/code 1 and retained application ID `com.tuxie.musicplayer`; `com.veylora.music` remains a separate identity.
- `node --check` on the app, offline UI, and staging script passed; `npm.cmd run android:sync` passed. `.\gradlew.bat assembleDebug assembleRelease` completed successfully.
- Debug APK `release/android/TuxieMusicPlayer-debug.apk`: 22,875,979 bytes; SHA-256 `2CF88A134546BF257C5E73B74A1950D1E1ECBB75CD4AB7B1F3AE4A47D9298866`. `aapt` verified package, label, version, and SDK; `apksigner` verified v1/v2 signatures.
- Unsigned release APK `release/android/TuxieMusicPlayer-1.0.0-release-unsigned.apk`: 14,268,861 bytes; SHA-256 `D8AF32107B316BD654879BDECC830492274F4D68341DF903934E58A2247031E8`. It is not signed for distribution.
- Browser preview reloaded and the existing local track remained listed. No ADB device/emulator was connected; no Android install, permission flow, MediaStore scan, background/lock-screen playback, volume, Bluetooth, or lifecycle test was performed.
- A home-screen widget, persistent folder grants, and native equalizer are not implemented. Startup recovery of saved Android playback state is implemented but unverified on a device. A protected release key/signing configuration remains required. Android Studio's installer could not download; command-line tools were sufficient. PowerShell execution policy was not changed.

## 2026-10-11 — Tuxie Music Player rebrand and Android asset preparation

- Changed browser and Capacitor branding to **Tuxie Music Player** and set the Android application ID to `com.tuxie.musicplayer`.
- The previous configured application ID was `com.veylora.music`. No Android project or APK existed in this workspace, so no existing project identity was migrated. Apps carrying the old ID cannot be updated in place by the new ID.
- Preserved the user-supplied portrait at `assets/branding/tuxie-logo.webp` and created optimized avatar, About portrait, web icon, adaptive foreground, density-specific launcher resources, and native splash artwork.
- Added app label/icon/splash resource staging for the Android project generated by Capacitor, and configured the Capacitor SplashScreen plugin.
- Refined the existing red-black Liquid Glass theme, added CSS page/artwork expansion transitions, and implemented mobile swipe navigation, mini-player expansion, and Now Playing track/dismiss gestures. Motion respects reduced-motion preferences.
- Browser checks confirmed the Tuxie title, avatar and About portrait load, the existing real MP3 still plays and pauses, Home-to-Library touch navigation works, and a downward swipe dismisses Now Playing. The album artwork loaded in the full player without browser errors.
- At 320×700 and 390×844, page width matched the viewport and the floating mini-player and navigation retained an 11px gap; at the bottom of the song list the final row remains above the player.
- Configuration JSON and prepared Android adaptive-icon XML parse successfully. The preserved portrait copy has the same SHA-256 hash as the supplied attachment.
- No Android project or APK has been built or installed. Node/npm, JDK, Gradle, Android SDK tools, and ADB were not available in the inspected environment.
- Android playback, system-picker import, native splash rendering, adaptive launcher appearance, background playback, audio focus, and lock-screen/notification controls remain unverified on a device.

## 2026-10-11 — Offline-first Liquid Glass and Android preparation

- Preserved the static music app and its offline library screens, responsive design, and local playback code.
- The local library supplies the playable catalogue; synthetic demo and cloud catalogue items are not presented as imported tracks.
- Kept local import, metadata/artwork, queue, favourites, playlists, search, browser equaliser, and timed lyrics.
- Prior browser checks at 320×700, 390×844, and 1440×900 found no horizontal overflow; previously restored real local MP3 playback, progress, pause, seeking, and one-song repeat-all were exercised in a browser only.

## Earlier browser local-library work

- Browser validation imported real MP3s, read metadata/artwork, verified duplicate detection and playback-state restoration, exercised the browser equaliser, and synchronized manually loaded timed LRC files.
- The selected Windows folder contained 209 MP3s (~1.96 GB); reported browser storage was ~1.49 GB. The full collection exceeded browser storage limits and did not persist durably.
- Private cloud preparation files remain in the project but no cloud upload or streaming is enabled or claimed.
