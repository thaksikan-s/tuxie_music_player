# Android release folder

## Current device-test artifact — Tuxie v2.0.0.0

`release/android/TUXIE v2.0.0.0.apk` is the current installable debug build for **Tuxie Music Player** (`com.tuxie.musicplayer`), Android versionName `2.0.0.0` / versionCode `2000000`. It is signed with the Android debug certificate for personal phone testing, not for Play Store distribution. It includes bounded Android 11+ MediaStore paging, cancellable library indexing, and the black/red liquid-glass interface. Size: 22,946,110 bytes. SHA-256: `3E1A3A1B9582C8BE2B0A017128075711B9D142C145F91EB59D1B3FE8CB0BA184`. The historical v1 files below are retained only as older artifacts.

## Current debug artifact

`release/android/Tuxie_V1.0.0.0.apk`

This is the current **debug** build for package `com.tuxie.musicplayer`, Android launcher label **Tuxie Music Player**, version 1.0.0 (versionCode 1), target SDK 35, and minimum SDK 23. It is signed with the Android debug certificate and can be installed for testing. It is not a Play Store release.

Measured size: 23,248,057 bytes. SHA-256: `D140D27777653510A74E1F863ABC6839182140AC62249C5C3885A7C49D10D32E`.

The APK was built and inspected with Android Build-Tools. It has not been installed or run on a phone or emulator; no device was connected during verification. Check the current size and SHA-256 with:

```powershell
Get-Item release\android\Tuxie_V1.0.0.0.apk | Select-Object FullName, Length
Get-FileHash release\android\Tuxie_V1.0.0.0.apk -Algorithm SHA256
```

The separately built release variant, `release/android/TuxieMusicPlayer-1.0.0-release-unsigned.apk`, is 14,265,474 bytes (SHA-256 `14B9A064329635D8263F6DA6D90F730331E4169E027C0219EE3058F93D23771F`). It is unsigned because there is no configured owner-controlled signing key, so it is not installable/distributable as a finished release.

## Rebuild

The project uses Capacitor 7, Node.js/npm, JDK 21, Android SDK Platform 35, Android Build-Tools, and the checked-in Gradle wrapper (Gradle 8.11.1). Android Studio is optional. In PowerShell, use `npm.cmd` so the blocked `npm.ps1` shim is not invoked. From the project root:

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
New-Item -ItemType Directory -Force release\android
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk release\android\Tuxie_V1.0.0.0.apk
Copy-Item android\app\build\outputs\apk\release\app-release-unsigned.apk release\android\TuxieMusicPlayer-1.0.0-release-unsigned.apk
```

For a fresh project only, run `npm.cmd run android:add` if the `android\` directory does not already exist. The app ID `com.tuxie.musicplayer` is intentionally distinct from the older `com.veylora.music` package and does not migrate that app or its data.

The generated launcher icon resources use a square composition of the supplied `assets\branding\tuxie-avatar-512.jpg` portrait on a dark background, with adaptive foreground/background resources. The portrait source remains unchanged. App label, browser title, and Capacitor display name are **Tuxie Music Player**.

## Install for device testing

Connect an authorized Android phone with USB debugging enabled or start an emulator:

```powershell
adb devices -l
adb install -r "release\android\TUXIE v2.0.0.0.apk"
```

No device installation has been verified. Test Android permission grant/denial and recovery, MediaStore scanning beyond 200 tracks, real local MP3 playback, seek/queue/transport controls, notification and lock-screen actions, widget controls, background playback, hardware media-volume synchronization, audio focus, Bluetooth/headphone events, relaunch recovery, and small-screen gestures before claiming runtime support.

To capture the playback crash if it recurs, connect and authorize the phone, run `adb logcat -c`, launch Tuxie, reproduce the crash, then collect relevant output with:

```powershell
adb logcat -d -v time AndroidRuntime:E Media3:* TuxiePlayback:* Capacitor/Console:* *:S
```

Share the output around `FATAL EXCEPTION` and the first `Caused by` line. The current APK adds Media3 error reporting and defensive service-start handling, but the crash is not confirmed fixed until native playback is exercised on the device.

## Release signing and limitations

No protected release signing key or store credentials are included. A signed production APK or AAB requires a user-owned protected key and signing configuration. Native Media3 playback, notifications, Android volume, widget controls, and process restoration are present in code/build artifacts but remain unverified on hardware. HTML/WebView-imported audio is foreground-only. Hardware-volume changes are reflected by reading `STREAM_MUSIC` while the app is visible; there is no native push listener. Persistent folder grants and a native Media3 equaliser are not implemented.

See [PROJECT_STATUS.md](../PROJECT_STATUS.md), [README.md](../README.md), and [RELEASE_NOTES.md](../RELEASE_NOTES.md) for feature and verification details.
