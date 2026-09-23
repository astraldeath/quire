# Changelog

## [Unreleased]

## [0.10.0]

- Organize account settings into Password, Devices, and OPDS tabs with a stable desktop dialog and compact mobile navigation.
- Keep a highlighted focal letter aligned during RSVP reading, and use the settings speed stepper for words per minute.
- Fix icon spacing and row alignment in the library destination menu.
- Browse shared libraries separately and explicitly add books to your personal library without losing reading progress or notes.

## [0.9.0]

- Browse OPDS 1.2 and 2.0 catalogs from Add books, including search, categories, covers, and direct downloads in supported formats. Save catalog sources across devices and in backups.
- Read your Quire Server library in other OPDS apps with separate, revocable app passwords. Hidden and locked books stay excluded.
- Add RSVP reading for reflowable text books, with adjustable speed, punctuation pauses, sentence rewind, and saved positions shared with normal reading. Playback pauses when the app loses focus; reading time and completed chapters contribute to statistics.
- Align reading settings with the main settings: desktop sidebar, compact mobile tabs, consistent spacing, and a stable dialog when switching sections.

## [0.8.0]

- Count chapters completed by swiping into the next chapter in reading statistics.
- Open CBR (RAR4/RAR5) and CB7 comics with existing page modes, preloading, bookmarks, and reading progress. Include these formats in server imports, backups, exports, and desktop file associations.
- Read fixed-layout EPUBs with publisher fonts, artwork, reading direction, and spreads intact. Save page bookmarks and resume at the correct page.
- Release fixed EPUB spreads when leaving them and cancel abandoned comic extraction without blocking the next page.

## [0.7.2]

- Restore labeled settings tabs on mobile in two compact rows, replacing the section dropdown.
- Keep mobile tabs visible and stationary while settings content scrolls, with keyboard navigation adapted to the layout.

## [0.7.1]

- Fix native command permission errors introduced in v0.7.0, including file opening, screen capture settings, local storage, sync, tracking, and update checks.
- If v0.7.0 cannot check for updates, download and install this release manually over your existing installation. Do not uninstall Quire or clear its app data.

## [0.7.0]

- Simplify library controls, book actions, details editing, and folder management. Create empty nested folders and preserve them through backups and server sync.
- Keep settings navigation in place when switching sections, with labeled desktop tabs and a compact phone selector.
- Improve tracking search and status editing, hidden-library navigation, and sync conflict comparisons.
- Protect unsaved edits and improve keyboard focus, confirmations, and recovery from failed operations.
- Clarify backup contents and storage usage, improve reading statistics, and format update notes for easier reading.
- Support larger shared-library uploads with cancellation and retry, and streamline account and server administration.
- Update Quire Server to use empty-folder sync and the improved shared-upload flow.

## [0.6.2]

- Fix the startup event-listener permission error in installed apps.
- Show unresolved sync conflicts in the library with a direct link to review them.

## [0.6.1]

- Detect chapters in books with underscore-separated titles, recap entries, and isolated numbering errors, restoring chapter progress for tracking.
- Count completed chapters when reading past a short final page, while excluding chapter jumps from reading activity.

## [0.6.0]

- Read PDF books with lazy page rendering, neighboring-page preloading, page layouts, bookmarks, and saved progress. Include PDFs in server libraries, backups, and file exports.
- Offer Quire as a desktop file handler without replacing existing defaults. Open books from your file manager, including when Quire is already running.
- Sync the current numbered chapter to tracking services while keeping completed chapters separate for reading statistics. Recognize padded titles such as `009—My First Monster`.

## [0.5.7]

- Show a local-only indicator on books and series when their files are not on the connected server.

## [0.5.6]

- Add a device-local desktop screen capture setting under Privacy, with Windows capture exclusion, limited macOS protection, and explicit Linux availability information.

## [0.5.5]

- Open books faster by deferring EPUB media extraction, pipelining native file reads, and reducing library and chapter-index work.
- Add Linux x64 AppImage and Debian packages to releases, with signed AppImage updates and desktop keyring support for sync and tracking.

## [0.5.4]

- Preload neighboring comic pages and retain decoded images when turning forward or back, including double-page spreads.
- Keep the current comic spread visible while the next one loads, and bound Webtoon buffering to nearby pages.
- Preload adjacent text chapter resources and retain the previous chapter for faster back navigation without advancing reading progress.

## [0.5.3]

- Remove the 128 MB limit for local book imports. Server upload limits remain separate.
- Load comic pages on demand instead of unpacking the entire CBZ into memory.
- Store new native book files separately from SQLite, with chunked transfers and compatibility with existing libraries.
- Export large books directly from native storage and support larger backups with Blob-backed creation and restore.

## [0.5.2]

- Fix libraries failing to open after updating from Windows builds with different SQL file line endings. Existing books, progress, notes, and settings are preserved.
- Keep database migration checks consistent across build platforms.

## [0.5.1]

- Navigate nested folders with clickable breadcrumbs.
- Rename or delete folders from the folder actions menu.
- Keep books, reading progress, and other memberships when deleting a folder and its subfolders.

## [0.5.0]

- Browse folders as cover cards alongside unfiled books, with nested folders in grid and list views.
- Add books to multiple folders without duplicating their files, progress, or annotations.
- Manage folder memberships for individual books, series, or a selection.
- Preserve existing folders, memberships, and reading data through backups and server sync.
- Keep search and Reading inclusive of books inside folders, and show folder differences when resolving sync conflicts.
- Update Quire Server before syncing books assigned to multiple folders.

## [0.4.0]

- Read comics as single pages, double-page spreads, or a continuous Webtoon strip, in either reading direction.
- Keep comic bookmarks and use taps, swipes, or keyboard navigation.
- Recover rejected sync batches without blocking unrelated book changes.
- Review local and server versions in the hosted WebUI under Settings / Sync.

## [0.3.0]

- Organize books into nested folders, with bulk moves and directory import.
- Read and export CBZ, FB2/FBZ, and DRM-free MOBI/AZW3 alongside EPUB.
- Preserve folder assignments and original formats in server sync and backups.
- Include every released platform in the update manifest and cache workflow builds.
- Keep standalone OAuth callbacks registered in cached iOS builds.

## [0.2.0]

- Add a custom desktop title bar with window controls.
- Check for desktop reader updates, view release notes, and install updates from Quire.
- Show server update notices and changelogs in the reader.
- Collapse chapter groups for easier navigation.
- Edit tracker entries and sync private books.

## [0.1.0]

- Initial Quire reader release.
