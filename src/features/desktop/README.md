# Desktop window controls

The native build target enables the custom window bar; browsers and iOS/Android do not render it. The bar uses the app theme, supports dragging and double-click maximize, and includes minimize, maximize/restore, and close controls. Fullscreen removes the bar and content inset.

At desktop widths of 900px and above, the library header contains the window controls and its empty space is draggable. Search and action controls retain their normal input behavior. The reader and narrower windows use the compact separate bar.

Native decorations remain enabled until the frontend bar has mounted. A page navigation restores decorations before the new frontend loads. While an HTML modal dialog (including the privacy shield) is open, the custom controls render in a manual popover inside the active dialog. This keeps them interactive above the modal backdrop without changing the window frame or header layout. Nested dialogs receive the controls until dismissed; dialog positioning reserves space below the bar.

Command failures attempt to restore native decorations. No desktop-only window permissions are granted to mobile, and the global Tauri window configuration retains its decorated default.

Tests cover platform gating, readiness ordering, control dispatch, modal fallback, and fullscreen insets. Native dragging, OS fullscreen, and frame transitions need a packaged desktop smoke check on each target OS.

## File handling

Installed desktop builds offer Quire for EPUB, CBZ, FB2, FBZ, MOBI, AZW3, and PDF. No generic ZIP association is registered; an explicitly opened `.fb2.zip` still works. Windows NSIS hooks register Open With entries and Default apps capabilities without writing extension defaults or UserChoice. macOS declares a Viewer with Alternate rank, and Linux declares MIME support. The user chooses defaults through the operating system. Windows settings has an explicit Default apps action; Finder and Linux file-manager instructions cover the other targets.

Native launch arguments (including the single-instance callback) and macOS Opened events populate an inbox. Frontend code must register the `desktop-open-files` listener before its initial `desktop_open_pending` call, process the returned `{id,name,size,error}` entries, then release each ID using `desktop_open_release`. Pending entries remain available across startup and reload, and duplicate queued paths are coalesced. There are at most 64 pending entries; later requests while full must be reopened after processing. Reads use `desktop_open_read` with an opaque ID, offset, and at most 1 MiB length. Arbitrary paths cannot be passed from JavaScript. Files are imported through the existing library storage flow, and no additional file-size limit is imposed.

Validation covers extension filtering, relative paths and spaces, ignored flags and OAuth URLs, retained queue entries, duplicate requests, read bounds, and settings platform gating. Packaged smoke checks remain necessary on each OS: open a book with the app closed, open another while it is running, select multiple files, and verify that installation leaves an existing default reader unchanged. Windows installer compilation also validates the NSIS hook. macOS and Linux integration is configured but cannot be runtime-tested on Windows.

Linux uses a custom desktop template with `Exec={{exec}} %U` so file managers forward selected files and OAuth URLs. Native arguments decode local `file://` URLs before extension checks; other URI schemes stay outside the file inbox. Debian and RPM use this template directly; Tauri AppImage generation reuses the Debian data directory. Tauri CLI 2.11.4's default desktop template omits argument placeholders.
