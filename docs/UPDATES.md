# Updates and releases

Windows x64 builds from 0.2.0 include the desktop updater. Readers can check for a newer version, read its changelog, and choose to install it. The installer closes Quire while replacing the application. Existing 0.1.0 installations need one manual installation of 0.2.0 or later because they do not contain the updater. Download the Windows installer from [Quire releases](https://github.com/astraldeath/quire/releases).

The stable update feed is [latest.json](https://github.com/astraldeath/quire/releases/latest/download/latest.json). It becomes available when the first signed release is published; a missing feed is an update-check error, not proof that the installation is current. Releases include a Windows x64 installer, Linux x64 AppImage and Debian packages, a signed universal Android APK, and an unsigned iOS IPA. The feed lists all four released platforms with detached Tauri signatures; automatic installation is supported on Windows and Linux AppImage. Android users install the newer APK over the existing app; iOS users must sign and sideload the new IPA. Server images retain their separate publishing workflow.

## Configure signing once

The public key in `src-tauri/tauri.conf.json` is pinned in installed readers. Store the matching private key outside the repository and back it up securely. Do not regenerate it for each release: existing readers trust the original key.

In the `astraldeath/quire` repository's **Settings → Secrets and variables → Actions**, create:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the matching Tauri private key file, not a path on your computer.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the key's password, if one was set. Leave this secret absent for an unencrypted key.

Do not paste the private key into source files, issue comments, workflow YAML, or build logs. The release workflow fails before building if the private key secret is missing. A mismatched key can produce an installer that existing readers reject; confirm the private key belongs to the public key pinned in the shipped reader.

Tauri updater signatures authenticate the downloaded update against that public key. They are separate from Windows Authenticode code signing, and do not remove Windows SmartScreen warnings. See the [Tauri updater documentation](https://v2.tauri.app/plugin/updater/) for key management and signature details.

## Publish a stable release

1. Update the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Add a matching `## [0.2.0]` style section to `CHANGELOG.md`. Use a stable three-part version; prereleases are intentionally excluded from this feed.
2. Run the normal checks and `node --test scripts/release-manifest.test.mjs`, then commit and push the reviewed changes.
3. Create and push the matching tag, such as `v0.2.0`. The **Publish release** workflow builds that exact tag. To retry, dispatch the same workflow with that existing tag as its input.
4. The workflow tests the frontend and native library, creates an x64 NSIS installer with its Tauri `.sig`, and generates `latest.json` from those files. Separate jobs build the signed Linux AppImage and Debian package, signed Android APK, and unsigned iOS IPA. Release notes come only from the matching changelog section.
5. The publisher waits for all four platform jobs. It signs the APK and IPA with detached Tauri signatures, adds their versioned download URLs to `latest.json`, validates the complete download set, and writes `SHA256SUMS.txt`. All assets upload to a draft before the release is published as latest. The feed points at the versioned release asset, never a moving installer URL. A published release cannot be replaced by a rerun; fix issues with a new version. Failed uploads leave a draft that can be retried.
6. Test from an older updater-enabled installation: check for the new version, inspect its notes, install, and confirm the application reopens with the new version and existing library data. This end-to-end check requires a real signed published release and is not replaced by manifest unit tests.

The feed uses Tauri's `version`, `notes`, `pub_date`, and `platforms` fields. Its platform keys are `windows-x86_64`, `linux-x86_64`, `android-universal`, and `ios-aarch64`; each entry contains a versioned `url` and the actual base64 `.sig` text in `signature`. The mobile keys describe downloadable packages and do not enable Tauri's desktop automatic installer on mobile. The workflow publishes all platform updater packages, their `.sig` files, and the Debian package and `latest.json` together. Do not mark unrelated releases as the repository's latest release without including a valid updater feed.

## Local builds and pull requests

Normal builds and pull-request checks do not require the signing secret. Only the release workflow enables `bundle.createUpdaterArtifacts` using a temporary build configuration. `windows.yml` continues to compile with `--no-bundle` and runs the release-manifest tests without access to signing credentials.

No GitHub release or signing secret is created by adding this pipeline. Configure the secret and publish a reviewed tag before expecting the live feed to work.

## Android signing

Add these repository Actions secrets (no GitHub Environment is required):

- `ANDROID_KEYSTORE_BASE64`: the base64-encoded contents of the permanent release keystore.
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password.
- `ANDROID_KEY_ALIAS`: the key alias, such as `quire`.
- `ANDROID_KEY_PASSWORD`: the key password, including when it matches the keystore password.

Back up the keystore and passwords outside Git. Changing the signing identity prevents existing installations from accepting an APK update. The Android job decodes the keystore only for signing, supplies passwords through environment variables, verifies the signature and alignment, and removes the temporary keystore even after failure. The Android keystore secrets are confined to the Android job. The publishing job receives only the Tauri updater key, scoped to its detached-signature step. Android SDK/NDK and Java are installed/configured on the hosted runner; no local Android toolchain is needed to trigger a release.

The APK includes all four Tauri Android architectures. An AAB, Play Store upload, and macOS package are not part of this workflow. Android builds and first-device installation still require acceptance testing, including standalone tracking, import/export, and upgrading without losing library data.

## Unsigned iOS download

Release IPAs use the same physical-device build and validation as the main-branch iOS workflow, with the filename `Quire_<version>_ios-unsigned.ipa`. They require no Apple signing secrets in Actions. The detached `.ipa.sig` authenticates the download with the Tauri updater key; it does not Apple-sign the IPA or make it installable without sideload signing. Users must sign before installing; see [Building](BUILDING.md). Main-branch development artifacts still expire after seven days; assets attached to a published release remain available until the release/assets are deleted.

The first tag using this workflow is the hosted build acceptance check. Local manifest tests and YAML validation cannot verify runner SDK availability, repository secrets, Apple compilation, or physical-device behavior. If a platform fails, no release is published; fix the failure before retrying or creating a new version. Never replace assets on an already published version.

## Build caches

See [CI cache boundaries](CI-CACHES.md) for cache contents, trusted write rules, and invalidation.

## Sideloading source

`repo/source.json` is an AltStore-style source for Feather, AltStore, and SideStore. The README includes app-opening links and its raw GitHub URL. It lists published stable IPAs with their exact versioned download URLs, sizes, dates, and release notes; it does not sign or modify the packages.

**Update sideloading source** runs after a successful **Publish release** workflow, on manual release changes, or by manual dispatch. It regenerates the file from GitHub release metadata and commits only that file to `main` when it changes. `workflow_run` handles releases created with `GITHUB_TOKEN`, which do not trigger another workflow's ordinary release event. No Pages site or additional secret is required.

To preview locally, run `node --test scripts/sideload-source.test.mjs` and `node scripts/sideload-source.mjs`. An optional `GITHUB_TOKEN` increases the GitHub API rate limit; never commit it.

## Linux packages

Linux x64 builds use Ubuntu 22.04 and Tauri's WebKitGTK 4.1 dependencies. The release job builds an AppImage with a Tauri updater signature and a `.deb` package. Both packages are required by release validation and included in `SHA256SUMS.txt`; `latest.json` uses `linux-x86_64` for the AppImage. The existing updater signing secret is reused.

Make the downloaded AppImage executable before opening it (`chmod +x Quire_*.AppImage`). AppImage installations support Update and restart; Debian installations update by downloading and installing the newer `.deb`, without overwriting package-manager-owned files. No Linux ARM package is built yet.

Server sync and MangaBaka tokens use the desktop Secret Service keyring (for example GNOME Keyring or KDE Wallet with Secret Service enabled). A running, unlocked keyring is required for those connections; offline reading does not require one. See [Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/) and [AppImage compatibility guidance](https://v2.tauri.app/distribute/appimage/).
