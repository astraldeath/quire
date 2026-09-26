# Quire

Read books and comics on Windows, Linux, Android, iOS, or in your browser. The installed reader works offline without an account. Connect to [Quire Server](https://github.com/astraldeath/quire-server) for sync, shared libraries, and the WebUI.

**[Download the latest release](https://github.com/astraldeath/quire/releases/latest)** · [Release notes](CHANGELOG.md) · [Reader guide](docs/READER.md) · [Host a server](https://github.com/astraldeath/quire-server#quick-start)

## Downloads

Choose a package from the [latest release](https://github.com/astraldeath/quire/releases/latest):

| Platform | Package |
| --- | --- |
| Windows x64 | `.exe` installer |
| Linux x64 | `.AppImage` or `.deb` |
| Android | Signed universal `.apk` |
| iOS | Unsigned `.ipa`, installed with a sideloading app |

Windows and Linux AppImage installations can update from **Settings > Updates**. See the [installation guide](docs/BUILDING.md) for other packages.

### iOS sideloading

<p>
  <a href="https://intradeus.github.io/http-protocol-redirector?r=altstore://source?url=https://raw.githubusercontent.com/astraldeath/quire/refs/heads/main/repo/source.json"><img alt="AltStore Source" src="https://img.shields.io/badge/open_in_app-_?style=for-the-badge&amp;label=AltStore&amp;labelColor=black&amp;color=728EAE"></a>
  <a href="https://intradeus.github.io/http-protocol-redirector?r=feather://source/https://raw.githubusercontent.com/astraldeath/quire/refs/heads/main/repo/source.json"><img alt="Feather Source" src="https://img.shields.io/badge/open_in_app-_?style=for-the-badge&amp;label=Feather&amp;labelColor=black&amp;color=728EAE"></a>
  <a href="https://intradeus.github.io/http-protocol-redirector?r=sidestore://source?url=https://raw.githubusercontent.com/astraldeath/quire/refs/heads/main/repo/source.json"><img alt="SideStore Source" src="https://img.shields.io/badge/open_in_app-_?style=for-the-badge&amp;label=SideStore&amp;labelColor=black&amp;color=728EAE"></a>
</p>

[Copy the source URL](https://raw.githubusercontent.com/astraldeath/quire/refs/heads/main/repo/source.json) into your sideloading app, or use a button above. The source follows published releases. IPAs need signing before installation.

## Reading and organizing

- Read with pagination or continuous scrolling, custom fonts, saved themes and presets, and per-book settings.
- Use single pages, double-page spreads, or Webtoon mode for comics, with left-to-right or right-to-left reading, taps, and swipes.
- Organize books into series and nested folders. A book can belong to several folders without duplicate files.
- Save bookmarks, highlights, and notes. Search book text and look up words.
- Track chapters and volumes with MangaBaka, and view reading time and lifetime statistics.
- Browse [OPDS catalogs](docs/OPDS.md) and download books into your library.
- Use [RSVP](docs/RSVP.md) to read one word at a time with speed controls and punctuation pauses.
- Back up your library, export original files, and optionally sync with your own server.

## Supported formats

| Format | Support |
| --- | --- |
| EPUB | Reflowable and fixed layout |
| Comics | CBZ, CBR (RAR4/RAR5), and CB7 |
| PDF | Page rendering, bookmarks, and saved progress |
| FictionBook | FB2, FBZ, and FB2.ZIP |
| Kindle | DRM-free MOBI and AZW3 |

PDF text selection, search, forms, and password-protected files are not supported. See the [reader guide](docs/READER.md) for format limits and import options.

## Documentation

| Guide | Contents |
| --- | --- |
| [Reader guide](docs/READER.md) | Library, reading, privacy, backups, and sync |
| [Tracking](docs/TRACKING.md) | MangaBaka setup and progress |
| [OPDS](docs/OPDS.md) | External catalogs and server access |
| [RSVP](docs/RSVP.md) | Playback, positions, and statistics |
| [Installation and builds](docs/BUILDING.md) | Packages, sideloading, and native builds |
| [Updates and releases](docs/UPDATES.md) | Signing and publishing |
| [CI caches](docs/CI-CACHES.md) | Workflow cache configuration |

## Development

Install Node.js and npm, then run:

```sh
npm ci
npm run dev
```

Open `http://localhost:1420`. For the hosted WebUI, run `npm run build:web` and serve `dist-web` with Quire Server. Native prerequisites are in the [build guide](docs/BUILDING.md).

```sh
npm run format:check
npm test
npm run build
npm run build:web
```

Public-domain [test books](tests/fixtures/README.md) are available for local checks.

## License

[MIT](LICENSE). Quire is pronounced “kwire”, rhyming with “choir”.
