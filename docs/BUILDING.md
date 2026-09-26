# Installing and building Quire

## Install a release

Download a package from [Quire releases](https://github.com/astraldeath/quire/releases).

| Platform | Installation |
| --- | --- |
| Windows x64 | Run the `.exe` installer |
| Linux x64 AppImage | Run `chmod +x Quire_*.AppImage`, then open the AppImage |
| Linux x64 Debian package | Install the `.deb` with your package manager |
| Android | Open the signed `.apk` and allow installation from that source when Android prompts |
| iOS | Import the unsigned `.ipa` into your sideloading app, sign it, and install it |

All native builds check for newer releases in **Settings > Updates** and show an update notice. Windows and Linux AppImage builds can install updates directly. Other builds link to the release: Debian users install the newer `.deb`, Android users install the newer APK over the existing app, and iOS users sign and sideload the new IPA. Keep the same Android signing identity to retain update compatibility. See [Updates and releases](UPDATES.md) for package details.

For iOS, add the [Quire sideloading source](https://raw.githubusercontent.com/astraldeath/quire/refs/heads/main/repo/source.json) to Feather, AltStore, or SideStore, or download an IPA directly. An unsigned IPA cannot launch until signed. Feather users select their local certificate and provisioning profile; the profile must permit the signing identifier and device and remain valid. Signing material stays on your device. New IPA releases need signing again.

Linux server connections, MangaBaka, and authenticated OPDS catalogs require a running, unlocked Secret Service keyring. Android currently supports local reading and anonymous OPDS catalogs but lacks secure credentials for these authenticated native connections.

## Build from source

Install Node.js 22, Rust 1.95 or newer, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires the Visual Studio C++ build tools and WebView2. Run commands from the repository root:

```sh
npm ci
npm test
npm run build
npm run tauri dev
npm run tauri build
```

The Windows installer is written under `src-tauri/target/release/bundle/nsis`. The native app uses a migrated SQLite database named `quire.db` in its application directory. New book files are immutable objects under the application data directory in `book-files/`; SQLite stores their references with metadata and the sync outbox atomically. Transfers use 1 MiB binary chunks. Older base64-backed rows remain readable. Keep the database and book-files directory together when copying native app data. Interrupted writes can leave unreferenced files; use Quire backups for portable library copies. Browser development uses IndexedDB in that browser profile, independently of the native library. Clearing site data removes that development library. Remove download retains book metadata and reading position; identical imports restore the file.

## Unsigned iPhone build from Windows

Every push to `main` automatically starts **Unsigned iOS device app** in GitHub Actions. To rebuild manually, open Actions, choose **Unsigned iOS device app**, then **Run workflow**. The workflow uses a hosted macOS/Xcode runner and the locked npm dependencies. It does not take signing certificates, profiles, passwords, or Apple account secrets. GitHub runner availability and minutes depend on your account.

Download **Quire-unsigned-ios** from the successful run and extract the `.ipa` from the artifact ZIP. Artifacts expire after seven days. The build directory is cleaned even when a step fails. You can also delete an artifact manually on the run page.

The pinned CLI dependency supports `tauri ios build --ci --target aarch64 --no-sign`. Its [2.11.4 implementation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/src/mobile/ios/build.rs) disables archive signing and writes a `Payload/*.app` IPA directly. The workflow checks that the package targets iPhoneOS and contains no provisioning profile or code-signature directory.

Transfer the extracted IPA to Files on your iPhone, import it into Feather, select your local certificate and provisioning profile, sign, and install. Signing material stays on your device. The bundle identifier is `app.quire.reader`; the identifier used for signing must be allowed by your profile, and the profile must authorize your device and remain valid. Use Feather's identifier override if appropriate for your profile. An unsigned IPA cannot launch before signing.

A successful hosted build does not verify installation or reading on a physical iPhone. On device, import an EPUB, navigate, change typography, close/relaunch, verify resume, remove its download, reimport the same EPUB and verify resume again. No iOS device compatibility is claimed until these checks pass. Windows cannot run Xcode or perform that validation locally.

## Hosted browser build

```sh
npm run build:web
```

Serve `dist-web` with Quire Server's `-web-dir` option. Hosted sessions use 30-day HttpOnly, SameSite=Strict cookies (Secure on HTTPS). Cookie writes require the configured public origin. Every authenticated request binds its tab to the session with `X-Quire-Session`, preventing stale tabs from syncing into a different account. Never store hosted tokens in browser storage. `npm run build` produces the installed-app frontend. Use HTTPS and a matching server release in production. Hosted authentication, administration, and server imports are enabled by the hosted build configuration.

## Release checks

Run `npm test`, `npm run build`, and `npm run build:web` before shipping. Native changes also need platform builds and device checks; browser tests cannot verify iOS behavior. See [Updates and releases](UPDATES.md) for signing, packaging, and publication.

## Book privacy

For iOS privacy changes, verify Face ID success and cancellation, passcode fallback, leaving a protected reader, app-switcher previews with Settings open, and reopening after termination. Install a fresh IPA to test native changes. On each platform, check switching apps while reading, returning to an open dialog, and cancelling an export. See the [reader privacy guide](READER.md#book-privacy) for expected behavior.

## Storage and rendering notes

Text readers preload the next chapter's resources and retain adjacent sections for back navigation. EPUB resources outside that window are released; formats with publication-wide caches keep their existing close-time cleanup. Chapter frames still rebuild when crossing a chapter boundary.

Reader frame security: EPUB scripts and event attributes are removed, and every book document receives a script-denying CSP before content. The iframe retains `allow-scripts allow-same-origin` because WebKit otherwise blocks even trusted event listeners installed by Quire. No EPUB-provided script is permitted by the CSP.

The server API contract is version 1. Sync edits, acknowledgements and cursor changes are transactional in IndexedDB and native SQLite. Native clients must restart after upgrading so the new database migration is applied.

Browser storage version 3 keeps EPUB bytes, metadata, and reading history separately. Upgrades are transactional and preserve notes and files; reload all open Quire tabs if an older tab blocks one. Native SQLite stores reading history in separate tables. Downloads are SHA-256 verified before caching; the reader validates the archive and sanitizes chapter content before display.

## Backup format and limits

Version 1 backups are ZIP archives containing `manifest.json` and optional `books/<sha256>.<format>` files. Data-only backups retain covers and annotations but require the original book files to restore reading access. Full backups include only files available on the device. There is no fixed 128 MB book or 512 MB backup limit. Metadata remains limited to 32 MB and 5,000 books, and archives are checked for unsafe paths, excessive expansion, CRC errors, and incorrect file identities. Creation processes one book at a time and uses a Blob-backed archive. Device memory and available storage still limit very large libraries. Backups are unencrypted; store them privately. Physical iOS Files/iCloud export and restore should be checked with a device build.
