# Quire Reader

An offline-first EPUB reader for Windows and iOS, licensed under MIT. This is an early development build.

Import DRM-free, reflowable EPUBs, organize them in a grid or list, edit series information, and resume reading offline. App appearance and reader typography are configurable. Removing a download keeps its metadata and reading position; importing the identical EPUB restores it.

See [building and private iPhone installation](docs/BUILDING.md) for setup. The iOS workflow produces an unsigned IPA for local signing with Feather; hosted builds and physical-device behavior still need validation.

Fixed-layout EPUBs, annotations, optional server sync, and tracker integrations are not implemented yet. No account is required for the local reader.

The optional sync server is a separate repository in `../quire-server`.

For manual reading tests, import the public-domain EPUBs in [tests/fixtures](tests/fixtures/README.md). They are test assets only; a fresh Quire installation starts with an empty library.

Reading modes include paginated, chapter scroll, and continuous chapter transitions. In continuous mode, scrolling past a chapter boundary loads the adjacent chapter; it does not preload every chapter into a single seamless document. Side taps/clicks, swipe paging, and page animation are configurable. Animation respects the system reduced-motion preference.

The reader opens with controls hidden. Tap/click the middle to toggle them, or press Escape to reveal them. Paginated touch drags track the finger and settle on release; cancelled drags return to the starting page. This hides Quire's reader controls, not the operating system status bar.

Reader frame security: EPUB scripts and event attributes are removed, and every book document receives a script-denying CSP before content. The iframe retains `allow-scripts allow-same-origin` because WebKit otherwise blocks even trusted event listeners installed by Quire. No EPUB-provided script is permitted by the CSP.

Bookmarks, highlights, and notes are stored locally with book metadata and survive removing and restoring an identical EPUB. Select text to copy, highlight, add a note, search within the book, or request an English definition. Define embeds the selected term’s [Wiktionary](https://en.wiktionary.org/) entry on request. The entry loads from Wiktionary on its own origin and requires internet access. No dictionaries are bundled.
