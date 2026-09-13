# Product UI conventions

- Use the Backups settings tab as the reference for new settings: grouped sections, clear headings, concise help, one obvious primary action, and a separate secondary or destructive action. Avoid a loose column of status text and bare action links.
- Use existing shared settings tabs and modal components. Keep focus outlines and selected borders fully inside scrollable content; use subtle, thin scrollbars.
- Keep buttons compact and consistent while retaining accessible touch targets. Use Lucide icons and meaningful action labels.
- Keep the underlying library and reading page stable when the mobile keyboard opens. Only the active dialog should adapt to the visible space; inputs must remain reachable and must not trigger iOS zoom.
- Anchor a dialog's top while the keyboard opens; shrink its scrolling body instead of recentering the whole dialog upward. Always respect the status-bar safe area and visual viewport panning. Draw control focus rings inward so scroll clipping cannot remove their edges.
- Server libraries fetch metadata and cover previews automatically. Fetch the EPUB when the user opens a book, show download activity, and retain it for offline reading. Preserve user metadata, notes, and progress during downloads.
- Verify settings at phone and desktop sizes, including focused inputs and overflow. Distinguish browser checks from verification on an actual iPhone.
