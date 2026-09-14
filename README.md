# Quire Reader

An offline-first EPUB reader for Windows and iOS, licensed under MIT. This is an early development build.

Import DRM-free, reflowable EPUBs, organize them in a grid or list, edit series information, and resume reading offline. App appearance and reader typography are configurable. Removing a download keeps its metadata and reading position; importing the identical EPUB restores it.

See [building and private iPhone installation](docs/BUILDING.md) for setup. The iOS workflow produces an unsigned IPA for local signing with Feather; hosted builds and physical-device behavior still need validation.

Fixed-layout EPUBs, optional server sync, and tracker integrations are not implemented yet. No account is required for the local reader.

The optional sync server is a separate repository in `../quire-server`.

For manual reading tests, import the public-domain EPUBs in [tests/fixtures](tests/fixtures/README.md). They are test assets only; a fresh Quire installation starts with an empty library.

Reading modes include paginated, chapter scroll, and continuous chapter transitions. In continuous mode, scrolling past a chapter boundary loads the adjacent chapter; it does not preload every chapter into a single seamless document. Side taps/clicks, swipe paging, and page animation are configurable. Animation respects the system reduced-motion preference.

The reader opens with controls hidden. Tap/click the middle to toggle them, or press Escape to reveal them. Paginated touch drags track the finger and settle on release; cancelled drags return to the starting page. This hides Quire's reader controls, not the operating system status bar.

Reader frame security: EPUB scripts and event attributes are removed, and every book document receives a script-denying CSP before content. The iframe retains `allow-scripts allow-same-origin` because WebKit otherwise blocks even trusted event listeners installed by Quire. No EPUB-provided script is permitted by the CSP.

Bookmarks, highlights, and notes are stored locally with book metadata and survive removing and restoring an identical EPUB. Select text to copy, highlight, add a note, search within the book, or request an English definition. Define requests English definitions directly from the [Wiktionary API](https://en.wiktionary.org/w/api.php) and renders plain text with source attribution. It requires internet access. No dictionaries are bundled.


Manual backups are available in Settings → Backup & restore. Choose Full library or Data only, create the backup, then save the `.quire-backup` file. Native Windows uses a save dialog; iOS exports the completed archive through Files (including iCloud Drive). The browser uses file sharing when supported, otherwise a download. Cancelled native exports do not update the last-backup date.

Restore validates the archive before showing a preview. Existing books and organization remain; identical EPUBs are matched by SHA-256 identity, the newest timestamped reading position wins, and distinct note versions are retained. Repeated restores do not duplicate the same passages. Restoring settings is opt-in and does not replace this device's last-backup date. Library changes commit atomically; a settings-write failure is reported separately after the library has been restored.

Version 1 backups are ZIP archives containing `manifest.json` and optional `books/<sha256>.epub` files. Data-only backups retain covers and annotations but require identical EPUB files to restore reading access. Full backups include only files available on the device. Limits: 512 MB per backup, 32 MB metadata, 128 MB per EPUB, and 5,000 books. Backups are unencrypted; store them privately. Physical iOS Files/iCloud export and restore should be checked with a device build.

Long-press a book or series on touch devices, or right-click it on desktop, to open library actions. Shift+F10 also opens the actions for a focused book. Remove download keeps reading data; Remove from library confirms deletion of the selected book or entire series, including local files, progress and annotations. Original EPUB files outside Quire and exported backups are unchanged. Book details also includes Remove from library.

## Optional self-hosted server

Open **Settings > Server**, enter your `user@server` account, find the server, then sign in. Use Advanced server address for custom ports. Accounts are created by your server owner. The reader remains usable offline and saves local changes with a durable sync outbox.

Sync runs after edits, on foreground/reconnection, and periodically while open. Conflicting notes or reading positions appear in Server settings for an explicit choice. Library metadata, progress and saved passages sync; EPUBs and device appearance settings do not upload automatically. Use **Book details > Server copy** to upload/download EPUBs or remove an uploaded server copy. Watched-folder originals cannot be deleted from the reader. Removing a server upload never removes downloaded copies or reading data.

Windows and iOS tokens are stored in the system credential store. Standalone browser tokens stay in memory; hosted WebUI tokens use sessionStorage for the current tab, and the server must explicitly allow the browser origin. Credentials, server connection state and pending sync operations are excluded from reader backup archives. Reconnect after restoring a backup.

The API contract is version 1. Sync edits, acknowledgements and cursor changes are transactional in IndexedDB and native SQLite. Native clients must restart after upgrading so the new database migration is applied.

## Server-hosted browser build

`npm run build:web` builds the shared reader in hosted mode. Serve `dist-web` through Quire Server's `-web-dir` option. It adds setup/sign-in, invitation redemption, account-specific browser storage, administration and shared-library filters. `npm run build` remains the installed-app build. Hosted browser tokens use sessionStorage so refreshes preserve sign-in within the tab. Restored sessions are verified with the server before opening account storage; signing out clears the saved token. Hosted imports upload to the personal server library, while shared uploads require an admin.
