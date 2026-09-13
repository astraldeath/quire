# Third-party notices

Quire's application code is MIT licensed. Dependencies retain their own licenses; the exact versions are recorded in package-lock.json and src-tauri/Cargo.lock.

- EPUB rendering uses [foliate-js](https://github.com/johnfactotum/foliate-js), copyright John Factotum and contributors, MIT licensed. Quire applies a guarded build-time modification to its paginator to prohibit EPUB scripting; dependency upgrades must review this modification.
- ZIP handling uses [zip.js](https://github.com/gildas-lormeau/zip.js), BSD-3-Clause licensed.
- Interface icons use [Lucide](https://lucide.dev), ISC licensed, with derived Feather icons under MIT.
- React is MIT licensed. Tauri and its SQL plugin are MIT/Apache-2.0 licensed.

The two Lewis Carroll EPUBs in tests/fixtures are unmodified Project Gutenberg editions, listed as public domain in the USA. Their included Project Gutenberg notices and license are retained; they are not relicensed under Quire's MIT license. See [fixture provenance](tests/fixtures/README.md) for sources and checksums. Reference screenshots and design prototypes are local working files, excluded from Git and builds. No Readest application code is included.
