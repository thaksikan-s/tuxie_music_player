# Tuxie Music Player

Tuxie Music Player 1.0.0 is an offline-first HTML/CSS/JavaScript player packaged with Capacitor 7. Android Media3 playback, MediaSession controls, MediaStore discovery, system media-volume integration, and a native home-screen widget are implemented in the Android project and compile into APKs. They have not yet been exercised on a real Android device. Browser-selected files continue to use Web Audio and are foreground-only on Android. Cloud streaming is not part of this release.

## Try it in a browser

1. Open `index.html` in a current browser. A local web server is recommended for folder-selection permissions.
2. Open **Settings → Choose audio files** or **Choose music folder**, then select audio you own or are permitted to play.
3. Browse your imported songs, search by title or artist, create playlists, favourite tracks, and use the queue and player controls.
4. The library and playback state use browser storage when available. Storage limits and permissions vary by browser. A large library may exceed the available IndexedDB quota.

The offline library displays songs imported from the current device only. No YouTube source or online catalogue is used.

## Branding assets

The supplied, unmodified portrait is preserved at `assets/branding/tuxie-logo.webp`. Cropped and optimized assets are included beside it:

- `tuxie-avatar-512.jpg` — compact app avatar and browser identity.
- `tuxie-portrait-720x960.jpg` — About screen portrait.
- `tuxie-app-icon-512.png` — browser/PWA icon.
- `tuxie-icon-foreground.png` and `android-res/` — Android adaptive and density-specific launcher resources.
- `tuxie-splash-1080x1920.png` — portrait splash artwork.

## Android packaging

The Capacitor application ID is `com.tuxie.musicplayer`, Android launcher label **Tuxie Music Player**, browser title **Tuxie Music Player**, and web output directory `www/`. The previous configured ID `com.veylora.music` remains a distinct app identity. Android treats the two IDs as separate apps: one cannot update the other or automatically migrate its app data.

### Toolchain and first setup

Install Node.js LTS and JDK 21. Android Studio is optional when using the Android SDK command-line tools; this project includes a Gradle wrapper, so a separate Gradle installation is unnecessary.

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --source winget
winget install --id EclipseAdoptium.Temurin.21.JDK --exact --source winget
```

In Android Studio's SDK Manager, install Android SDK Platform 35, Build-Tools, and Platform-Tools. Alternatively, unpack Google's official `commandlinetools-win-*_latest.zip` into `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, then set the SDK environment and install the packages:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$env:JAVA_HOME\bin;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$env:PATH"
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-35" "build-tools;34.0.0"
```

The `$env:` assignments above apply to that PowerShell process. Set them again in each new terminal, or configure the same values in Windows Environment Variables. Use `npm.cmd` in PowerShell to avoid the machine's blocked `npm.ps1` shim; do not change the PowerShell execution policy. From the project root, install dependencies and prepare the web assets:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
npm.cmd install
npm.cmd run prepare:web
npm.cmd run android:sync
Push-Location .\android
try {
  .\gradlew.bat testDebugUnitTest assembleDebug assembleRelease
  if ($LASTEXITCODE -ne 0) { throw "Android tests or build failed." }
} finally { Pop-Location }
```

Generate the Android platform once with `npm.cmd run android:add` only if the `android/` directory does not exist. For an existing project, use `npm.cmd run android:sync`. Both commands stage web assets and apply the Tuxie launcher, adaptive-icon, app-label, and splash resources. Their source resources are under `assets/branding/android-res/`.

### Build and install a debug APK

From the project root:

```powershell
New-Item -ItemType Directory -Force release\android
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk release\android\Tuxie_V1.0.0.0.apk
Get-Item release\android\Tuxie_V1.0.0.0.apk | Select-Object FullName, Length
```

Inspect the APK with Android SDK build tools, then install it with Android Studio or:

```powershell
adb install -r release\android\Tuxie_V1.0.0.0.apk
```

The debug APK is intended for testing. A distributable release needs a private signing key and signing configuration; Google Play publishing normally uses a signed AAB, Play Console enrollment, a compliant store listing, and current target-SDK requirements. No signing key or Play Console setup is included.

## Android playback and permissions

For shared device music, the native plugin queries MediaStore and returns content URIs and available title, artist, album, duration, and album-art metadata. Users start a scan from Home or Settings. Android 13+ uses `READ_MEDIA_AUDIO`; older Android uses `READ_EXTERNAL_STORAGE` capped at API 32. Notification permission is optional and requested separately from library access. No broad all-files permission is requested. Rescan the library from Settings after adding or removing tracks. MediaStore access does not expose protected/private folders.

Those MediaStore tracks are handed to a Media3 ExoPlayer in an Android `MediaSessionService`. The service declares the media-playback foreground-service type, uses Media3 audio-focus handling and headphone-unplug handling, and supplies the system media session/notification and lock-screen transport controls. The app volume slider calls Android's `STREAM_MUSIC` volume API and reads it when player state is refreshed, including while the app is visible; it has no native push listener for hardware-button volume changes. These native paths are build- and manifest-verified, not device-verified; do not assume lock-screen, notification, Bluetooth, process-recovery, audio-focus, or background behavior until tested on a phone.

The HTML multi-file picker remains available for individual files. Those imported WebView files still use the HTML audio element and do not use the native background service. Persistent Android Storage Access Framework folder grants and native equalizer processing for Media3 tracks are not implemented. Android MediaStore track, queue, position, and play/pause state are saved and startup attempts to restore them after process restart; this recovery has not been device-tested. Audio-library and notification permissions are separate; notification permission is optional and can be enabled in Settings. If media permission is denied, Settings can be opened from the library prompt.

## Current features and limits

- Local audio import, metadata and embedded artwork parsing, duplicate checks, queue, play/pause, next/previous, seeking, shuffle, repeat, favourites, playlists, search, and recently played.
- Android MediaStore scanning and native Media3 queue playback for shared device audio; album artwork thumbnails are fetched lazily for the WebView.
- Android MediaSession service with system notification/lock-screen controls, audio-focus configuration, noisy-route handling, and STREAM_MUSIC volume bridge. These native features remain untested on a physical device.
- Native Android home-screen AppWidgetProvider with artwork/title/artist, transport buttons, and event-driven updates. Widget behavior remains device-unverified.
- Browser Web Audio equaliser where supported; manual timed `.lrc` lyrics; browser Media Session integration where supported.
- The portrait-led red Liquid Glass interface, responsive phone and desktop layouts, optional light theme, reduced-motion support, page transitions, and touch gestures are implemented in the web app.
- Album mood filters are based on track metadata, not audio analysis or a curated recommendation service.
- No cloud music catalogue, cloud upload, licensed lyrics service, or streaming source is enabled in this offline release.

## Current verification status — Android engineering build

- Capacitor sync, JavaScript syntax/config checks, Gradle `testDebugUnitTest`, `assembleDebug`, and `assembleRelease` passed.
- `aapt` confirmed package `com.tuxie.musicplayer`, Android label **Tuxie Music Player**, versionCode 1/versionName 1.0.0, target SDK 35, and min SDK 23. `apksigner` verified the debug APK's v1/v2 signatures.
- Debug APK: `release/android/Tuxie_V1.0.0.0.apk` — 23,248,057 bytes; SHA-256 `D140D27777653510A74E1F863ABC6839182140AC62249C5C3885A7C49D10D32E`.
- Unsigned release APK: `release/android/TuxieMusicPlayer-1.0.0-release-unsigned.apk` — 14,265,474 bytes; SHA-256 `14B9A064329635D8263F6DA6D90F730331E4169E027C0219EE3058F93D23771F`. It is not installable/distributable until signed with the owner's protected key.
- Added tests for Android media-volume scaling. The Android manifest contains the Media3 service and home widget. Native widget, MediaSession, volume, permission, and library runtime behavior have not been tested on a phone.
- Browser checks played the already-imported real MP3 and observed advancing progress; the 360×780 layout had no horizontal overflow. ADB found no attached phone/emulator; the APK was not installed and the reported playback crash remains unverified.
- Hardware volume is read from `STREAM_MUSIC` in a combined playback snapshot while the app is visible (about once per second). Fixed-volume devices disable the slider; external volume changes are not pushed by a native listener.
- Audio and notification permission requests are separate. Notification permission is optional. Persistent SAF folder grants and a native Media3 equaliser remain unimplemented.

## Previous verification status (superseded historical snapshot)

The current source was synchronized with Capacitor and built using `assembleDebug`. Android `aapt` confirmed package `com.tuxie.musicplayer`, launcher label **Tuxie**, versionCode 1/versionName 1.0.0, target SDK 35, and min SDK 23. The debug APK's v1/v2 signatures passed `apksigner`. A prior unsigned release artifact exists but was not rebuilt with the current changes and must not be treated as current.

- Current debug: `release/android/Tuxie_V1.0.0.0.apk` — 23,246,183 bytes; SHA-256 `48ABE3CF1CB3173FF44A729867DEDC13AB54E5293843E89F3B1D980C64D06C14`.
- Manifest inspection confirmed the Media3 service and the audio-library, notification, and media-playback foreground-service permissions.

This debugging build makes the next MediaStore page count/action visible above the 60-row UI slice and reports Media3 playback errors in the app. The Android service also logs and retains playback errors, validates `content://` playback URIs, and the Capacitor bridge rejects service-start/queue exceptions instead of letting them escape. These are defensive fixes; the user-reported phone crash's root cause cannot be established without its Android log.

No ADB device or emulator was connected, so the APK was not installed. Browser checks played the already-imported real MP3, advanced playback progress, and confirmed no horizontal overflow at 360×780; the mini-player and mobile navigation remained within the viewport. These checks do not validate the native bridge or Android playback. On-device library scanning beyond the first 200 tracks and the playback crash remain unverified.

Node.js 24, npm 11, JDK 21, Android command-line tools, Android SDK Platform 35, Platform-Tools, and the Gradle wrapper are configured. Android Studio's winget installer could not download in this environment; it is not required for the command-line build. The build emitted an Android SDK XML-version warning and standard Gradle `flatDir` warnings but completed successfully.

See [PROJECT_STATUS.md](./PROJECT_STATUS.md), [RELEASE_NOTES.md](./RELEASE_NOTES.md), and [release/README.md](./release/README.md) for the latest test evidence and blockers.
