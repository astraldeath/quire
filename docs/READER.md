# Reader guide

Quire opens DRM-free EPUB, FB2/FBZ, MOBI/AZW3, PDF, CBZ, CBR, and CB7 files. Use **Add books** to import files or [browse OPDS catalogs](OPDS.md).

## Reading

Reading modes include paginated, chapter scroll, and continuous chapter transitions. In continuous mode, scrolling past a chapter boundary loads the adjacent chapter; it does not preload every chapter into a single seamless document. Side taps/clicks, swipe paging, and page animation are configurable. Animation respects the system reduced-motion preference. [RSVP](RSVP.md) displays reflowable text one word at a time.

The reader opens with controls hidden. Tap/click the middle to toggle them, or press Escape to reveal them. Paginated touch drags track the finger and settle on release; cancelled drags return to the starting page. This hides Quire's reader controls, not the operating system status bar.

Bookmarks, highlights, and notes are stored locally with book metadata. Removing a download keeps them; reimporting the identical file restores reading access. Select text to copy, highlight, add a note, search within the book, or request an English definition. Define requests English definitions directly from the [Wiktionary API](https://en.wiktionary.org/w/api.php) and renders plain text with source attribution. It requires internet access. No dictionaries are bundled.

## Backups

Manual backups are available in Settings > Backups. Choose Full library or Data only, create the backup, then save the `.quire-backup` file. Native Windows uses a save dialog; iOS exports the completed archive through Files (including iCloud Drive). The browser uses file sharing when supported, otherwise a download. Cancelled native exports do not update the last-backup date.

Restore validates the archive before showing a preview. Existing books and organization remain; identical EPUBs are matched by SHA-256 identity, the newest timestamped reading position wins, and distinct note versions are retained. Repeated restores do not duplicate the same passages. Restoring settings is opt-in and does not replace this device's last-backup date. Library changes commit atomically; a settings-write failure is reported separately after the library has been restored.

Backups are unencrypted; store them privately. Data-only backups include covers, annotations, and history but need the original files for reading. Full backups include only files available on this device. See [backup format and limits](BUILDING.md#backup-format-and-limits) for archive details.

## Library actions

Long-press a book or series on touch devices, or right-click it on desktop, to open library actions. Shift+F10 also opens the actions for a focused book. Remove download keeps reading data; Remove from library confirms deletion of the selected book or entire series, including local files, progress and annotations. Original EPUB files outside Quire and exported backups are unchanged. Book details also includes Remove from library.

## Optional self-hosted server

Open **Settings > Sync**, enter your `user@server` account, find the server, then sign in. Use Advanced server address for custom ports. Accounts are created by your server owner. The reader remains usable offline and saves local changes with a durable sync outbox.

Sync runs after edits, on foreground/reconnection, and periodically while open. Conflicting notes or reading positions appear in Sync settings for an explicit choice. Library metadata, progress and saved passages sync; EPUBs and device appearance settings do not upload automatically. Use **Book details > Server copy** to upload EPUBs or remove an uploaded server copy. Watched-folder originals cannot be deleted from the reader. Removing a server upload never removes downloaded copies or reading data.

Windows, iOS, and Linux store tokens in the system credential store. Linux requires an unlocked Secret Service keyring. Android does not yet support native server sign-in because secure credential storage is unavailable. Standalone browser tokens stay in memory, and the server must allow that browser origin. Hosted WebUI sessions use HttpOnly cookies. Credentials, server connection state and pending sync operations are excluded from reader backup archives. Reconnect after restoring a backup.

## Hosted WebUI

The hosted WebUI provides sign-in, invitations, account administration, and shared-library filters. Browser storage is separate for each account. Reopening the WebUI restores your session; signing out revokes it. Personal imports upload to your server library, and shared uploads require an administrator. See [Building](BUILDING.md) for deployment commands and session security.

## Comics and library organization

Local imports have no fixed 128 MB file-size cap. CBZ pages are extracted on demand, with an archive cache of up to two pages and 64 MiB. The compressed book, visible images, and decoded image surfaces also use memory. Individual CBZ images retain a 128 MiB extraction limit and compression-ratio checks; EPUB resources retain their separate extraction limits. Server uploads currently remain limited to 128 MB.

CBZ reading settings provide Single, Double, and Webtoon layouts. The cover stays alone in Double mode; subsequent pages form spreads. Reading direction controls spread order, side taps, horizontal swipes, and arrow keys. Webtoon navigation scrolls by a screenful, while the table of contents and bookmarks jump to a page. Layout changes keep the current page, and comic preferences are included in backups.

Single and Double modes retain decoded images for the current and neighboring pages or spreads. A pending page turn keeps the previous spread visible until the destination is ready. Webtoon keeps a nearby image window capped at 12 pages. Preloading does not advance reading progress, and closing the reader releases its retained resources.

**Settings > Sync** shows changes that need a choice between local and server versions, including in the hosted WebUI. A rejected edit stays local for review while unrelated books continue syncing. Selecting a version explicitly resolves that record; reloading or retrying does not discard it.

Folders support nested organization and retain empty folders across restarts. Folder catalogs sync with a compatible server and are included in backups. Normal and hidden collections have separate folder catalogs.

Library filters cover reading status and local availability. Sort by last read, date added, title, or author; series additionally sort by volume. View controls set grid/list, cover size, and grouping. Select mode offers batch download, finished/unread status, and confirmed removal. Series continuation skips finished volumes. Book and series overflow menus are also available by hold or right-click.

Hosted URLs support refresh, browser history, and direct book links. Installed Quire on Windows, iOS, and Linux connects directly to MangaBaka without a Quire server; the hosted WebUI uses server-side OAuth. Tracking is optional per book or explicitly applied to a series, with individual overrides preserved. See [standalone tracking](TRACKING.md) for account setup and limitations.

## Uploads and device storage

Book and series action menus include **Upload to server** for downloaded books. Existing server copies are skipped. **Keep downloaded** excludes a book (or every current volume in a series) from automatic offloading; it does not download missing volumes.

Under **Settings > Library > Storage**, auto-upload and automatic offloading are both off by default. Auto-upload sends existing and newly imported local EPUBs to the connected account’s personal library. Preferences are specific to this device/browser and server account, and are not included in exported backups.

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

## Book privacy

Book actions > Privacy offers Normal, Locked and Hidden. Library > View > Hidden books opens the authenticated hidden collection. Settings > Privacy manages the passcode, optional iOS biometrics, automatic locking and the background cover. The salted passcode verifier and book restrictions sync to the connected account and are included in portable backups. Without a server, they remain local. Face ID enrollment, unlocked sessions, retry counters, automatic locking and the preview cover stay device-local. EPUBs, server copies and exports remain unencrypted. This protects access through Quire's reader UI, not files accessed outside it or server-administrator access.

Update the server and every client before relying on synced privacy; older clients do not enforce these restrictions. Privacy sync runs before book sync and retains offline edits. Independent changes merge; concurrent changes to a book keep the more restrictive choice. A subsequent explicit change can remove protection. If devices create or change different passcodes concurrently, the server passcode is kept and sync reports that choice. Receiving a changed passcode relocks the library and disables local biometrics until enabled again.

The native library binds its private settings to the first connected server account. Reconnecting that account resumes sync; switching to another account stops sync instead of sending the previous account's privacy settings. Hosted browsers already use separate storage per account. Restoring a portable backup preserves any existing passcode and combines restrictions without weakening them; a fresh installation uses the backup's passcode. Server backups retain the privacy record in SQLite.

On iOS, the native app covers its window before app-switcher snapshots and supports Face ID/Touch ID. Other platforms use the Quire passcode; a browser overlay cannot guarantee that operating-system previews are obscured.

Cover when inactive is a device-local setting. Desktop windows show the wordmark when unfocused; browsers cover hidden tabs and can optionally cover browser focus loss. Focus loss alone does not lock books: the existing background auto-lock preference remains separate. Quire's file pickers, exports, share sheets and biometric prompts are excluded from focus-based covering. The iOS native app-switcher cover is unchanged.
