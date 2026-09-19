# Changelog

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
