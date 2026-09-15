# Quire Reader

**Quire** is pronounced **“kwire”** (/kwaɪər/), rhyming with **choir**.

An offline-first EPUB reader for Windows, iOS, and the browser. The installed reader works without an account; [Quire Server](https://github.com/astraldeath/quire-server) adds shared libraries, sync, and a hosted WebUI.

## Features

- Grid and list libraries, series grouping, filters, sorting, and bulk actions.
- Paginated and scrolling reading, configurable typography and themes.
- Bookmarks, highlights, notes, in-book search, and online Wiktionary definitions.
- Full-library or data-only backups with a preview before restoring.
- Optional server sync and MangaBaka book or series tracking.

DRM-free, reflowable EPUBs are supported. Fixed-layout EPUBs are not supported. Server covers and metadata load automatically; book files download when opened and remain available offline.

## Development

Install Node.js and npm, then run:

```sh
npm ci
npm run dev
```

The development reader opens at `http://localhost:1420`. For a hosted WebUI, run `npm run build:web` and serve `dist-web` through Quire Server. `npm run build` builds the installed-app frontend.

See [building and iPhone installation](docs/BUILDING.md) for native prerequisites and unsigned IPA installation. Public-domain [test EPUBs](tests/fixtures/README.md) are provided for manual checks; new installations start empty.

## Checks and contributions

```sh
npm run format:check
npm test
npm run build
npm run build:web
```

Use `npm run format` to format source and tests. Type checking rejects unused declarations. Keep changes in incremental Conventional Commits, and exclude credentials, runtime data, and generated builds. Physical iOS testing remains separate from browser checks.

## Documentation

- [Reader, backups, sync, and storage guide](docs/READER.md)
- [Build and installation guide](docs/BUILDING.md)
- [Server setup and administration](https://github.com/astraldeath/quire-server)

Licensed under [MIT](LICENSE).
