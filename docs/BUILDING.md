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

After pushing this repository to your GitHub account, open Actions, choose **Unsigned iOS device app**, then **Run workflow**. The workflow uses a hosted macOS/Xcode runner and the locked npm dependencies. It does not take signing certificates, profiles, passwords, or Apple account secrets. GitHub runner availability and minutes depend on your account.

Download **Quire-unsigned-ios** from the successful run and extract the `.ipa` from the artifact ZIP. Artifacts expire after seven days. The build directory is cleaned even when a step fails. You can also delete an artifact manually on the run page.

The pinned CLI dependency supports `tauri ios build --ci --target aarch64 --no-sign`. Its [2.11.4 implementation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/src/mobile/ios/build.rs) disables archive signing and writes a `Payload/*.app` IPA directly. No speculative signing flags or Xcode export signing workaround are required. The workflow checks that the package targets iPhoneOS and contains no provisioning profile or code-signature directory.

Transfer the extracted IPA to Files on your iPhone, import it into Feather, select your local certificate and provisioning profile, sign, and install. Signing material stays on your device. The provisional bundle identifier is `app.quire.reader`; the identifier used for signing must be allowed by your profile, and the profile must authorize your device and remain valid. Use Feather's identifier override if appropriate for your profile. An unsigned IPA cannot launch before signing.

The first successful hosted build and a physical iPhone install remain acceptance checks. On device, import an EPUB, navigate, change typography, close/relaunch, verify resume, remove its download, reimport the same EPUB and verify resume again. No iOS device compatibility is claimed until these checks pass. Windows cannot run Xcode or perform that validation locally.
