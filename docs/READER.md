# Reader guide

Reading modes include paginated, chapter scroll, and continuous chapter transitions. In continuous mode, scrolling past a chapter boundary loads the adjacent chapter; it does not preload every chapter into a single seamless document. Side taps/clicks, swipe paging, and page animation are configurable. Animation respects the system reduced-motion preference.

The reader opens with controls hidden. Tap/click the middle to toggle them, or press Escape to reveal them. Paginated touch drags track the finger and settle on release; cancelled drags return to the starting page. This hides Quire's reader controls, not the operating system status bar.

Reader frame security: EPUB scripts and event attributes are removed, and every book document receives a script-denying CSP before content. The iframe retains `allow-scripts allow-same-origin` because WebKit otherwise blocks even trusted event listeners installed by Quire. No EPUB-provided script is permitted by the CSP.

Bookmarks, highlights, and notes are stored locally with book metadata and survive removing and restoring an identical EPUB. Select text to copy, highlight, add a note, search within the book, or request an English definition. Define requests English definitions directly from the [Wiktionary API](https://en.wiktionary.org/w/api.php) and renders plain text with source attribution. It requires internet access. No dictionaries are bundled.


Manual backups are available in Settings > Backups. Choose Full library or Data only, create the backup, then save the `.quire-backup` file. Native Windows uses a save dialog; iOS exports the completed archive through Files (including iCloud Drive). The browser uses file sharing when supported, otherwise a download. Cancelled native exports do not update the last-backup date.

Restore validates the archive before showing a preview. Existing books and organization remain; identical EPUBs are matched by SHA-256 identity, the newest timestamped reading position wins, and distinct note versions are retained. Repeated restores do not duplicate the same passages. Restoring settings is opt-in and does not replace this device's last-backup date. Library changes commit atomically; a settings-write failure is reported separately after the library has been restored.

Version 1 backups are ZIP archives containing `manifest.json` and optional `books/<sha256>.<format>` files. Data-only backups retain covers and annotations but require the original book files to restore reading access. Full backups include only files available on the device. There is no fixed 128 MB book or 512 MB backup limit. Metadata remains limited to 32 MB and 5,000 books, and archives are checked for unsafe paths, excessive expansion, CRC errors, and incorrect file identities. Creation processes one book at a time and uses a Blob-backed archive. Device memory and available storage still limit very large libraries. Backups are unencrypted; store them privately. Physical iOS Files/iCloud export and restore should be checked with a device build.

Long-press a book or series on touch devices, or right-click it on desktop, to open library actions. Shift+F10 also opens the actions for a focused book. Remove download keeps reading data; Remove from library confirms deletion of the selected book or entire series, including local files, progress and annotations. Original EPUB files outside Quire and exported backups are unchanged. Book details also includes Remove from library.

## Optional self-hosted server

Open **Settings > Server**, enter your `user@server` account, find the server, then sign in. Use Advanced server address for custom ports. Accounts are created by your server owner. The reader remains usable offline and saves local changes with a durable sync outbox.

Sync runs after edits, on foreground/reconnection, and periodically while open. Conflicting notes or reading positions appear in Server settings for an explicit choice. Library metadata, progress and saved passages sync; EPUBs and device appearance settings do not upload automatically. Use **Book details > Server copy** to upload EPUBs or remove an uploaded server copy. Watched-folder originals cannot be deleted from the reader. Removing a server upload never removes downloaded copies or reading data.

Windows and iOS tokens are stored in the system credential store. Standalone browser tokens stay in memory; hosted WebUI sessions use persistent HttpOnly cookies, and the server must explicitly allow the browser origin. Credentials, server connection state and pending sync operations are excluded from reader backup archives. Reconnect after restoring a backup.

The API contract is version 1. Sync edits, acknowledgements and cursor changes are transactional in IndexedDB and native SQLite. Native clients must restart after upgrading so the new database migration is applied.

## Server-hosted browser build

`npm run build:web` builds the shared reader in hosted mode. Serve `dist-web` through Quire Server's `-web-dir` option. It adds setup/sign-in, invitation redemption, account-specific browser storage, administration and shared-library filters. `npm run build` remains the installed-app build. Hosted browser sessions use 30-day HttpOnly, SameSite=Strict cookies (Secure on HTTPS). Reopening the WebUI restores the account from the server. Cookie writes require the exact configured public origin, and every tab binds requests to its session ID to prevent cross-account sync after an account switch. Sign-out revokes the session and clears the cookie. Hosted imports upload to the personal server library, while shared uploads require an admin.

## Library and tracking

Local imports have no fixed 128 MB file-size cap. CBZ pages are extracted on demand, with an archive cache of up to two pages and 64 MiB. The compressed book, visible images, and decoded image surfaces also use memory. Individual CBZ images retain a 128 MiB extraction limit and compression-ratio checks; EPUB resources retain their separate extraction limits. Server uploads currently remain limited to 128 MB.

CBZ reading settings provide Single, Double, and Webtoon layouts. The cover stays alone in Double mode; subsequent pages form spreads. Reading direction controls spread order, side taps, horizontal swipes, and arrow keys. Webtoon navigation scrolls by a screenful, while the table of contents and bookmarks jump to a page. Layout changes keep the current page, and comic preferences are included in backups.

**Settings / Sync** shows changes that need a choice between local and server versions, including in the hosted WebUI. A rejected edit stays local for review while unrelated books continue syncing. Selecting a version explicitly resolves that record; reloading or retrying does not discard it.

Library filters cover reading status and local availability. Sort by last read, date added, title, or author; series additionally sort by volume. View controls set grid/list, cover size, and grouping. Select mode offers batch download, finished/unread status, and confirmed removal. Series continuation skips finished volumes. Book and series overflow menus are also available by hold or right-click.

Hosted URLs support refresh, browser history, and direct book links. Installed Quire connects directly to MangaBaka without a Quire server; the hosted WebUI uses server-side OAuth. Tracking is optional per book or explicitly applied to a series, with individual overrides preserved. See [standalone tracking](TRACKING.md) for account setup and limitations.

Browser storage version 3 keeps EPUB bytes, metadata, and reading history separately. Upgrades are transactional and preserve notes and files; reload all open Quire tabs if an older tab blocks one. Native SQLite stores reading history in separate tables. Downloads are SHA-256 verified before caching; the reader validates the archive and sanitizes chapter content before display.

Changes use incremental Conventional Commits. Run `npm test`, `npm run build`, and `npm run build:web` before shipping. A production deployment must use the matching server release and HTTPS; physical iOS testing remains separate from browser checks.


## Uploads and device storage

Book and series action menus include **Upload to server** for downloaded books. Existing server copies are skipped. **Keep downloaded** excludes a book (or every current volume in a series) from automatic offloading; it does not download missing volumes.

Under **Settings → Library → Storage**, auto-upload and automatic offloading are both off by default. Auto-upload sends existing and newly imported local EPUBs to the connected account’s personal library. Preferences are specific to this device/browser and server account, and are not included in exported backups.

Offloading supports finished-only filtering, a minimum number of days since opening, and an optional download-size threshold in MB. When the threshold is enabled, only eligible books are removed until usage is below it; protected, recently used, and unverified books may keep usage above the target. The open book and pinned downloads are always protected. Notes, progress, covers, and metadata remain local.

Automatic work runs while Quire is open and visible, online, and connected, processing one upload and one offload per pass (once per minute). Failed files rotate through retries. Before offloading, Quire downloads and hashes the server copy to verify it is available and matches the book, so verification uses network data. Opening an offloaded book downloads it again. No background work runs after the app closes.

## EPUB export and numbering

Choose **Export EPUB** from a book’s action menu to save its original file. Server-only books download first; installed apps use the system save picker and browsers offer file sharing or a download. Exported EPUBs do not include Quire notes or reading progress; use a backup for those.

Import keeps embedded series and volume metadata, falling back to explicit “Vol.” or “Volume” numbers in the title or filename. Numbered chapters are detected from the table of contents when opening a book without a volume number. Existing metadata edits are preserved. See [tracking](TRACKING.md) for automatic chapter progress.

## Statistics

**Settings > Statistics** shows current library counts and reading history for all time, this year, or this month. Library counts include books in the current library; chapter and volume history remains after removing books. A completed volume counts once, regardless of its volume number. Rereading a chapter does not add another distinct chapter to the same period.

Time is an estimate of active reading: hidden pages and reader dialogs pause collection, and two minutes without interaction stops the clock. Overlapping activity from tabs or devices counts once. Reading speed uses timed, forward page turns and visible word counts; it appears after at least a minute of usable samples. Scrolling contributes reading time, but not speed samples. Numbered chapter detection depends on the EPUB table of contents.

Earlier saved completion progress contributes only undated, all-time estimates. Quire cannot reconstruct earlier reading time or speed. New activity is checkpointed every 30 seconds and when leaving the reader; an abrupt app termination can lose the latest unsaved interval.

History stays on the device without a connected server. When connected, Quire syncs it with the account alongside library data. Both backup types include history, including removed books. Repeated restores and sync retries preserve record identities so they do not inflate totals. Use the matching server release to sync statistics.
