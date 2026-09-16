# Native privacy

The iOS plugin authenticates with LocalAuthentication and covers the window before an app-switcher snapshot. The cover preference is stored in UserDefaults so it survives launches. The passcode and per-book policy remain in the account-scoped Quire privacy store.

The frontend uses a passcode on desktop and in browsers. Native biometric and app-switcher cover support currently targets iOS. Verify Face ID success/cancel, background auto-lock, and app-switcher snapshots on a physical device after installing a fresh IPA.

The cover is an overlay in the existing window. iOS background notifications control auto-lock; transient WebView visibility changes during Face ID do not. Authentication retains its LocalAuthentication context, checks availability first, and completes on the main thread. A real background transition invalidates an in-flight attempt.

`scripts/ios-icons.py` installs the privacy wordmark into the generated application's asset catalog after `tauri ios init`. The IPA verifier checks that the compiled catalog contains it. Do not use SwiftPM `Bundle.module` here: the static plugin's resource bundle was absent from the exported IPA, causing a fatal Swift initializer during the inactive notification when biometrics started. Missing artwork must leave a working opaque cover, never terminate the app.

Reference reviewed: Suwatte's `LocalAuthManager.swift` and `STTContentBlur` in `iOS/Views/Main/ContentView.swift` (https://github.com/Suwatte/Suwatte). The Quire implementation uses UIKit over its existing Tauri WebView.
