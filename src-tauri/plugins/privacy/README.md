# Native privacy

The iOS plugin authenticates with LocalAuthentication and covers the window before an app-switcher snapshot. The cover preference is stored in UserDefaults so it survives launches. The passcode and per-book policy remain in the account-scoped Quire privacy store.

The frontend uses a passcode on desktop and in browsers. Native biometric and app-switcher cover support currently targets iOS. Verify Face ID success/cancel, background auto-lock, and app-switcher snapshots on a physical device after installing a fresh IPA.
