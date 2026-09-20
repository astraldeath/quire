# Third-party notices

Quire's application code is MIT licensed. Dependencies retain their own licenses; the exact versions are recorded in package-lock.json and src-tauri/Cargo.lock.

- EPUB rendering uses [foliate-js](https://github.com/johnfactotum/foliate-js), copyright John Factotum and contributors, MIT licensed. Quire applies a guarded build-time modification to its paginator and fixed-layout renderer to provide bounded loading, load comic wrappers through srcdoc, and recover failed page turns; EPUB scripting is prohibited by sanitization and a restrictive document CSP; dependency upgrades must review this modification.
- ZIP handling uses [zip.js](https://github.com/gildas-lormeau/zip.js), BSD-3-Clause licensed.
- Interface icons use [Lucide](https://lucide.dev), ISC licensed, with derived Feather icons under MIT.
- React is MIT licensed. Tauri and its SQL plugin are MIT/Apache-2.0 licensed.

The two Lewis Carroll EPUBs in tests/fixtures are unmodified Project Gutenberg editions, listed as public domain in the USA. Their included Project Gutenberg notices and license are retained; they are not relicensed under Quire's MIT license. See [fixture provenance](tests/fixtures/README.md) for sources and checksums. Reference screenshots and design prototypes are local working files, excluded from Git and builds. No Readest application code is included.

`src/vendor/mobi.js` adapts foliate-js 1.0.1 (MIT; license alongside it) to sanitize documents before parsing, reject DRM, and bound text decompression. Review this adapter when upgrading Foliate.

CBR and CB7 decoding uses [libarchive.js](https://github.com/nika-begiashvili/libarchivejs) 2.0.2 (MIT), powered by [libarchive](https://www.libarchive.org/) (BSD). Its worker is adapted at build time to bound entry sizes/counts, reject encryption, propagate initialization failures, and release native archive handles after each operation. Review the guarded transform before changing the pinned version. Worker RPC uses [Comlink](https://github.com/GoogleChromeLabs/comlink) (Apache-2.0).
