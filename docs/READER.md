# Reader guide

## Add and organize books

Choose **Add books** to import DRM-free EPUB, FB2/FBZ, MOBI/AZW3, PDF, CBZ, CBR, or CB7 files, or [browse an OPDS catalog](OPDS.md). Downloaded books remain available offline. Large books need enough device memory and storage; archive safety checks can reject oversized or excessively compressed resources.

Use **Filters**, **Sort**, and **View** to change reading status filters, local availability, ordering, grid/list layout, cover size, and series grouping. **Select** enables batch downloads, finished/unread changes, and removal. Series continuation skips finished volumes.

Open a book or series menu with its overflow button, a long press, or a right-click. Shift+F10 opens the menu for a focused book. **Book details** shows its summary; metadata editing is a separate action. Imported series and volume metadata is retained, with explicit “Vol.” or “Volume” numbers in titles and filenames used as a fallback. Manual edits are preserved.

Choose **Folders** in a book or series menu to change its folder memberships. Folders can be nested, and empty folders remain after restarting. Folder organization syncs with a compatible server and is included in backups. Normal and hidden collections have separate folders.

## Reading

The reader opens with its controls hidden. Tap or click the middle to toggle them, or press Escape to reveal them. This changes Quire's controls, not the operating system status bar.

**Reading settings** controls typography, reader colors, layout, side taps, swipes, and animation. Reader appearance can differ from the app theme in **Settings > Appearance**. Animation respects reduced-motion preferences. Available controls depend on the book format.

Text books support pagination, chapter scrolling, and continuous chapter transitions. Continuous mode loads the next or previous chapter when you cross a boundary; it does not display every chapter in one document. Touch page drags follow your finger and settle on release. [RSVP](RSVP.md) offers one-word-at-a-time playback for reflowable text.

Use contents and search to navigate. Select text to copy, highlight, add a note, search within the book, or request an English definition. Definitions come from [Wiktionary](https://en.wiktionary.org/w/api.php) and require internet access. Bookmarks, highlights, notes, and progress stay with the book when its download is removed; reimporting the identical file restores reading access.

### Comics

Comic settings offer **Single**, **Double**, and **Webtoon** layouts. Double keeps the cover alone and pairs subsequent pages. Reading direction controls spread order, side taps, horizontal swipes, and arrow keys. Webtoon navigation scrolls by a screenful; contents and bookmarks jump to a page. Changing layout keeps your current page.

## Files and removal

Open **Files and downloads** in a book or series menu to manage its device copy. These actions have different effects:

| Action | Effect |
| --- | --- |
| Remove download | Removes the local file and keeps metadata, progress, bookmarks, highlights, and notes |
| Export EPUB, Export PDF, or another format | Saves the original file in its existing format; server-only books download first |
| Upload to server | Uploads downloaded books to the connected account, skipping existing server copies |
| Keep downloaded / Download and keep | Protects downloads from automatic offloading and downloads missing files when needed |
| Allow automatic offloading | Removes that protection without immediately deleting the download |

Exports do not include Quire annotations or progress; use a backup to preserve those. Installed apps use the system export dialog; browsers use file sharing when supported or a download.

**Remove from library** requires confirmation and removes the selected book or series, its device downloads, and its saved reading data. When connected, reading-data removal syncs to the server and other devices; downloads already on other devices remain. Original files outside Quire, exported backups, and lifetime reading history are kept.

Deleting an uploaded server copy is separate from removing a download. It leaves downloaded copies and reading data intact. Watched-folder originals cannot be deleted through the reader.

## Connect a server

Open **Settings > Sync**, enter your `user@server` account, find the server, and sign in. Use **Advanced server address** for custom ports. Your server owner creates accounts. Reading remains available offline, and local edits wait for reconnection.

Sync runs after edits, on foreground or reconnection, and periodically while open. It carries library metadata, progress, saved passages, folders, privacy settings, and reading history. Device appearance settings remain local. Book uploads are separate from reading-data sync.

Choose **Shared libraries** from the library title menu to browse books shared with your account. You can read them there without adding them to your personal library. Choose **Add to library** from a book's menu to keep it in **All books**. Adding a book preserves its reading position and notes, and syncs the choice to your other devices. A book can belong to your personal library and a shared collection at the same time.

Downloaded shared books remain available offline. If the shared collection is no longer available, find retained copies under **Downloaded shared books**. Restoring a backup adds new restored books to your personal library; books already on the device keep their existing membership. Update both the reader and server to use separate shared browsing.

**Settings > Sync** shows notes and positions that need a choice between local and server versions. Rejected edits remain local for review while unrelated books continue syncing. Retrying or reloading does not discard them.

Windows, iOS, and Linux use the system credential store. Linux needs an unlocked Secret Service keyring. Android native server sign-in is unavailable until secure credential storage is supported. Standalone browser credentials last for the session, and the server must allow that browser's origin. Credentials, connection state, and pending sync operations are excluded from backups; reconnect after restoring.

### Hosted WebUI

The server-hosted browser reader provides sign-in, invitations, account administration, and shared-library browsing. Browser storage is separate for each account. Reopening restores your session; signing out revokes it. Personal imports upload to your server library, while shared uploads require an administrator. Book links support refresh, browser history, and opening in another tab. See [Building](BUILDING.md#hosted-browser-build) for deployment and session security.

## Uploads and device storage

Under **Settings > Library > Storage**, automatic uploads and offloading are off by default. Auto-upload sends existing and newly imported local books to your personal server library. These preferences belong to this device or browser and server account; backups exclude them.

Offloading can target finished books, require a minimum time since opening, and use a download-size threshold. It removes only eligible downloads until usage falls below the threshold. Pinned downloads, the open book, recently used books, and books without a verified server copy can keep usage above the target. Notes, progress, covers, and metadata remain.

Before offloading, Quire downloads and hashes the server copy to check that it is available and matches. This uses network data. Opening an offloaded book downloads it again. Automatic work runs while Quire is open, visible, online, and connected, processing one upload and one offload per pass. Failed files retry; no work continues after the app closes.

## Tracking

Use **Tracking** in a book or series menu to connect MangaBaka and confirm a match. Tracking is optional. Applying a series match preserves individual book overrides. Windows, iOS, and Linux connect directly without a Quire server; the hosted WebUI uses server-side tracking. Android native tracking is not yet available.

Automatic progress uses volume numbers or reliably detected numbered chapters. It does not treat every contents entry as a chapter. See [MangaBaka tracking](TRACKING.md) for matching, account changes, manual corrections, and offline behavior.

## Backups

Open **Settings > Backups**, choose **Full library** or **Data only**, create the archive, and save the `.quire-backup` file. Full backups include files available on this device. Data-only backups retain covers, annotations, and history but need the original book files for reading. Both include folder organization. Backups are unencrypted; store them privately.

Windows uses a save dialog, iOS exports through Files (including iCloud Drive), and browsers use file sharing or a download. Cancelling a native export does not update the last-backup date.

Restore validates the archive before showing a preview. Existing organization and books remain. Identical files are matched by their contents, the newest timestamped reading position wins, and distinct note versions are retained. Repeated restores do not duplicate passages or history. Restoring settings is optional and keeps this device's last-backup date. If settings fail to restore after a successful library restore, Quire reports that separately. See [backup limits](BUILDING.md#backup-format-and-limits).

## Book privacy

Choose **Privacy** in a book menu to set Normal, Locked, or Hidden. **Library > View > Hidden books** opens the hidden collection after authentication. **Settings > Privacy** manages the passcode, optional iOS biometrics, automatic locking, and the background cover.

Privacy protects access through Quire. Book files, server copies, exports, and backups remain unencrypted, and server administrators can access server files. Update every client and the server before relying on synced restrictions; older clients do not enforce them.

The passcode verifier and book restrictions sync and are included in backups. Biometrics, unlocked sessions, retry counters, automatic locking, and cover preferences stay on the device. Concurrent book restrictions keep the more restrictive choice; you can change it explicitly afterward. Concurrent passcode changes keep the server passcode and report that choice. A changed passcode relocks the library and disables local biometrics until enabled again.

Native privacy settings bind to the first connected server account. Switching accounts stops privacy sync rather than sending the previous account's settings. A backup restore preserves an existing passcode and combines restrictions without weakening them; a fresh installation uses the backup passcode.

On iOS, Quire covers its window before app-switcher snapshots and supports Face ID/Touch ID. Other platforms use the passcode. **Cover when inactive** hides desktop windows when unfocused and browser tabs when hidden, with optional covering on browser focus loss. Covering alone does not lock books; background auto-lock is separate. Quire's file pickers, share sheets, exports, and biometric prompts are excluded from focus-based covering. A browser cover cannot guarantee that the operating system obscures app previews.

## Statistics

**Settings > Statistics** shows library counts and reading history for all time, this year, or this month. Library counts reflect current books; chapter and volume history survives removal. A completed volume counts once, and rereading a chapter does not add another distinct chapter in the same period.

Time estimates active reading. Hidden pages and reader dialogs pause collection; two minutes without interaction stops the clock. Overlapping activity across tabs or devices counts once. Reading speed uses timed forward page turns and visible word counts, appearing after at least a minute of usable samples. Scrolling adds reading time but no speed samples.

Earlier completion progress contributes only undated all-time estimates; past time and speed cannot be reconstructed. Activity saves every 30 seconds and when leaving the reader, so abrupt termination can lose the latest interval. History stays local without a server and syncs with a compatible connected account. Both backup types include history for removed books.
