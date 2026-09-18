# Desktop updates and releases

Windows x64 builds from 0.2.0 include the desktop updater. Readers can check for a newer version, read its changelog, and choose to install it. The installer closes Quire while replacing the application. Existing 0.1.0 installations need one manual installation of 0.2.0 or later because they do not contain the updater. Download the Windows installer from [Quire releases](https://github.com/astraldeath/quire/releases).

The stable update feed is [latest.json](https://github.com/astraldeath/quire/releases/latest/download/latest.json). It becomes available when the first signed release is published; a missing feed is an update-check error, not proof that the installation is current. This pipeline only publishes Windows x64 updates. Browser/server deployments and iOS installations use their own deployment paths.

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
3. Create and push the matching tag, such as `v0.2.0`. The **Windows release** workflow builds that exact tag. To retry, dispatch the same workflow with that existing tag as its input.
4. The workflow tests the frontend and native library, creates an x64 NSIS installer with its Tauri `.sig`, and generates `latest.json` from those files. Release notes come only from the matching changelog section.
5. All assets upload to a draft before the release is published as latest. The feed points at the versioned release asset, never a moving installer URL. A published release cannot be replaced by a rerun; fix issues with a new version. Failed uploads leave a draft that can be retried.
6. Test from an older updater-enabled installation: check for the new version, inspect its notes, install, and confirm the application reopens with the new version and existing library data. This end-to-end check requires a real signed published release and is not replaced by manifest unit tests.

The feed uses Tauri's `version`, `notes`, `pub_date`, and `platforms.windows-x86_64` fields. `signature` contains the actual `.sig` text. The workflow publishes the `.exe`, `.exe.sig`, and `latest.json` together. Do not mark unrelated releases as the repository's latest release without including a valid updater feed.

## Local builds and pull requests

Normal builds and pull-request checks do not require the signing secret. Only the release workflow enables `bundle.createUpdaterArtifacts` using a temporary build configuration. `windows.yml` continues to compile with `--no-bundle` and runs the release-manifest tests without access to signing credentials.

No GitHub release or signing secret is created by adding this pipeline. Configure the secret and publish a reviewed tag before expecting the live feed to work.
