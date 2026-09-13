# Quire Reader

An offline-first EPUB reader for Windows and iOS, licensed under MIT. This is an early development build.

Import DRM-free, reflowable EPUBs, organize them in a grid or list, edit series information, and resume reading offline. App appearance and reader typography are configurable. Removing a download keeps its metadata and reading position; importing the identical EPUB restores it.

See [building and private iPhone installation](docs/BUILDING.md) for setup. The iOS workflow produces an unsigned IPA for local signing with Feather; hosted builds and physical-device behavior still need validation.

Fixed-layout EPUBs, annotations, optional server sync, and tracker integrations are not implemented yet. No account is required for the local reader.

The optional sync server is a separate repository in `../quire-server`.

For manual reading tests, import the public-domain EPUBs in [tests/fixtures](tests/fixtures/README.md). They are test assets only; a fresh Quire installation starts with an empty library.

Reading modes include paginated, chapter scroll, and continuous chapter transitions. In continuous mode, scrolling past a chapter boundary loads the adjacent chapter; it does not preload every chapter into a single seamless document. Side taps/clicks, swipe paging, and page animation are configurable. Animation respects the system reduced-motion preference.
