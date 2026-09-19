# CI caches

Node setup retains the npm download cache keyed by `package-lock.json`; installs still use `npm ci`.

Rust caches contain Cargo registry/git dependencies and only `deps`, `build`, and `.fingerprint` compilation directories under `src-tauri/target`. Keys separate runner OS/architecture, Rust 1.95.0, target group, Android NDK version where applicable, and `Cargo.lock`. A commit suffix refreshes compiled objects, with restore fallback restricted to the same lockfile/toolchain/target. Changing those inputs starts a new cache; bump `rust-v1` to discard all existing entries. Xcode or runner SDK upgrades may also warrant a key-version bump.

Android additionally caches only Gradle dependency modules and wrapper distributions. Its key includes OS/architecture, Java/Android platform versions, the npm lockfile, and generated Gradle build/wrapper files. Project build directories, Gradle configuration caches, user properties, signing configuration, APKs, IPAs, Windows bundles, generated updater configuration, and keystores are outside the cache paths. Mobile caches are saved before signing.

Explicit Rust and Gradle saves run only in the canonical repository on non-PR main or version-tag runs. Pull requests can restore available caches but do not save these caches. GitHub also scopes cache visibility to branches and allows access to default-branch caches; a new release can reuse a matching main cache. npm caching retains setup-node's own behavior. Caches contain no credentials and must never be treated as secret storage. A cold cache remains a supported build path.

The cache action is pinned to the upstream v4.3.0 commit. Clear repository Actions caches or bump the relevant `*-v1` prefix after a suspected bad cache. Actual cache hit rates and native builds require a GitHub runner; actionlint verifies workflow syntax locally.

The iOS OAuth callback is checked into `src-tauri/Info.plist`, so a cached dependency build cannot remove it. Android clears the deep-link plugin build output after project generation because its build script writes the generated manifest. Other Rust dependencies remain cached.

Linux release builds use an Ubuntu 22.04 / x86_64-unknown-linux-gnu cache key, separate from Android and other Linux runners. AppImages, Debian packages, signing keys, and signatures are not cached.
