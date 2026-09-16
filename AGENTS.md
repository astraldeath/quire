# Product UI conventions

- Write direct, concise UI copy. Do not add slogans, feature introductions, or help that repeats a heading, label, or visible action. Keep non-obvious consequences, recovery steps, required attribution, and accessibility labels. Put operator and implementation details in documentation rather than everyday reader screens.

- Use the Backups settings tab as the reference for new settings: grouped sections, clear headings, concise help, one obvious primary action, and a separate secondary or destructive action. Avoid a loose column of status text and bare action links.
- Use existing shared settings tabs and modal components. Keep focus outlines and selected borders fully inside scrollable content; use subtle, thin scrollbars.
- Keep buttons compact and consistent while retaining accessible touch targets. Use Lucide icons and meaningful action labels.
- Keep the underlying library and reading page stable when the mobile keyboard opens. Only the active dialog should adapt to the visible space; inputs must remain reachable and must not trigger iOS zoom.
- Anchor a dialog's top while the keyboard opens; shrink its scrolling body instead of recentering the whole dialog upward. Always respect the status-bar safe area and visual viewport panning. Draw control focus rings inward so scroll clipping cannot remove their edges.
- Server libraries fetch metadata and cover previews automatically. Fetch the EPUB when the user opens a book, show download activity, and retain it for offline reading. Preserve user metadata, notes, and progress during downloads.
- Verify settings at phone and desktop sizes, including focused inputs and overflow. Distinguish browser checks from verification on an actual iPhone.

- Hosted mode reuses the reader and isolates browser storage by authenticated user ID. Keep server-only administration and imports behind hosted build configuration; native app behavior must remain unchanged.
- Admin tabs each have a Lucide icon. Access selection uses compact, full-width horizontal rows with styled checkboxes; do not inherit vertical form-label layouts. Keep select chevrons inset and style file-picker buttons consistently.

- Never use Unicode characters as UI icons (including checkmarks). Use Lucide SVG icons with flex alignment for icon-and-label buttons.

- Hosted authentication uses same-origin HttpOnly cookies and X-Quire-Session binding on authenticated requests. Never store hosted tokens in browser storage or remove the session binding; it prevents stale tabs from syncing into a different account.

- Keep tracking and similar feature dialogs concise: show the match, status, and primary action; place optional explanations and advanced controls behind disclosure. Offer series actions at the series level, preserving individual book overrides.

- WebUI destinations use meaningful URLs and browser history; preserve direct links, refresh, Back/Forward, and opening books in new tabs. Native app navigation remains local. Reading dialogs dismiss on backdrop clicks, while clicks inside keep them open.

- Library browsing uses a compact Filters / Sort / View / Select toolbar. Keep account actions in one menu, show Lucide overflow actions on every book and series, emphasize volume numbers within a series, and reveal bulk actions only in selection mode. Book details starts with a summary; metadata editing is explicit. Reading excludes finished books, and continuation respects the selected library.

- Use incremental Conventional Commits for completed changes. Commit and push when requested; exclude runtime data, OAuth secrets, and generated builds.
