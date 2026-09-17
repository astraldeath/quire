# Building Quire

Install Node.js 22, Rust 1.95 or newer, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires the Visual Studio C++ build tools and WebView2. Run commands from the repository root:

```sh
npm ci
npm test
npm run build
npm run tauri dev
npm run tauri build
```

The Windows installer is written under `src-tauri/target/release/bundle/nsis`. The native app uses a migrated SQLite database named `quire.db` in its application directory. EPUB bytes are base64 text in the same row as metadata, allowing atomic import/removal without multi-connection transactions; this adds approximately one-third storage overhead. Browser development uses IndexedDB in that browser profile, independently of the native library. Clearing site data removes that development library. Remove download retains book metadata and reading position; identical imports restore the file.

## Unsigned iPhone build from Windows

Every push to `main` automatically starts **Unsigned iOS device app** in GitHub Actions. To rebuild manually, open Actions, choose **Unsigned iOS device app**, then **Run workflow**. The workflow uses a hosted macOS/Xcode runner and the locked npm dependencies. It does not take signing certificates, profiles, passwords, or Apple account secrets. GitHub runner availability and minutes depend on your account.

Download **Quire-unsigned-ios** from the successful run and extract the `.ipa` from the artifact ZIP. Artifacts expire after seven days. The build directory is cleaned even when a step fails. You can also delete an artifact manually on the run page.

The pinned CLI dependency supports `tauri ios build --ci --target aarch64 --no-sign`. Its [2.11.4 implementation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/src/mobile/ios/build.rs) disables archive signing and writes a `Payload/*.app` IPA directly. No speculative signing flags or Xcode export signing workaround are required. The workflow checks that the package targets iPhoneOS and contains no provisioning profile or code-signature directory.

Transfer the extracted IPA to Files on your iPhone, import it into Feather, select your local certificate and provisioning profile, sign, and install. Signing material stays on your device. The provisional bundle identifier is `app.quire.reader`; the identifier used for signing must be allowed by your profile, and the profile must authorize your device and remain valid. Use Feather's identifier override if appropriate for your profile. An unsigned IPA cannot launch before signing.

The first successful hosted build and a physical iPhone install remain acceptance checks. On device, import an EPUB, navigate, change typography, close/relaunch, verify resume, remove its download, reimport the same EPUB and verify resume again. No iOS device compatibility is claimed until these checks pass. Windows cannot run Xcode or perform that validation locally.

## Book privacy

Book actions → Privacy offers Normal, Locked and Hidden. Library → View → Hidden books opens the authenticated hidden collection. Settings → Privacy manages the passcode, optional iOS biometrics, automatic locking and the background cover. The salted passcode verifier and book restrictions sync to the connected account and are included in portable backups. Without a server, they remain local. Face ID enrollment, unlocked sessions, retry counters, automatic locking and the preview cover stay device-local. EPUBs, server copies and exports remain unencrypted. This protects access through Quire's reader UI, not files accessed outside it or server-administrator access.

Update the server and every client before relying on synced privacy; older clients do not enforce these restrictions. Privacy sync runs before book sync and retains offline edits. Independent changes merge; concurrent changes to a book keep the more restrictive choice. A subsequent explicit change can remove protection. If devices create or change different passcodes concurrently, the server passcode is kept and sync reports that choice. Receiving a changed passcode relocks the library and disables local biometrics until enabled again.

The native library binds its private settings to the first connected server account. Reconnecting that account resumes sync; switching to another account stops sync instead of sending the previous account's privacy settings. Hosted browsers already use separate storage per account. Restoring a portable backup preserves any existing passcode and combines restrictions without weakening them; a fresh installation uses the backup's passcode. Server backups retain the privacy record in SQLite.

The `privacy` native plugin covers the iOS window before background snapshots and uses LocalAuthentication for Face ID/Touch ID. Other platforms currently use the Quire passcode; a browser overlay does not guarantee the operating system's app-switcher snapshot is obscured. On an iPhone, verify Face ID success/cancellation, passcode fallback, leaving a protected reader, app-switcher previews with Settings open, and reopening after termination. Install a fresh IPA to test native changes.
