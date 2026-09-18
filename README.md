# Quire Reader

**Quire** is pronounced **“kwire”** (/kwaɪər/), rhyming with **choir**.

An offline-first book reader for Windows, Android, iOS, and the browser. The installed reader works without an account; [Quire Server](https://github.com/astraldeath/quire-server) adds shared libraries, sync, and a hosted WebUI.

## Features

- Grid and list libraries, series grouping, nested folders, filters, sorting, and bulk actions.
- Paginated and scrolling reading, configurable typography and themes.
- Bookmarks, highlights, notes, in-book search, and online Wiktionary definitions.
- Full-library or data-only backups with a preview before restoring.
- Reading statistics with lifetime history, active-time estimates, and optional server sync.
- MangaBaka book or series tracking directly from the installed app, with no Quire server required.
- Optional server sync and shared libraries.

Supported formats: reflowable EPUB, CBZ comics, FB2 (including FBZ and FB2.ZIP), and DRM-free MOBI/AZW3. PDF, CBR, and fixed-layout EPUBs are not supported. Server covers and metadata load automatically; book files download when opened and remain available offline.

Use **Add books > Import folder** to import supported files from a directory and retain its subfolders. Use **Move to folder** on a book or a selection to organize the library. Folders contain books; empty folders disappear. Folder assignments are included in backups and sync when a server is connected. **Export** saves the original book file.

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
- [Standalone MangaBaka tracking](docs/TRACKING.md)
- [Build and installation guide](docs/BUILDING.md)
- [Updates and release publishing](docs/UPDATES.md)
- [Server setup and administration](https://github.com/astraldeath/quire-server)

Licensed under [MIT](LICENSE).
