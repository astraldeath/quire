# Desktop window controls

The native build target enables the custom window bar; browsers and iOS/Android do not render it. The bar uses the app theme, supports dragging and double-click maximize, and includes minimize, maximize/restore, and close controls. Fullscreen removes the bar and content inset.

At desktop widths of 900px and above, the library header contains the window controls and its empty space is draggable. Search and action controls retain their normal input behavior. The reader and narrower windows use the compact separate bar.

Native decorations remain enabled until the frontend bar has mounted. A page navigation restores decorations before the new frontend loads. While an HTML modal dialog (including the privacy shield) is open, the custom controls render in a manual popover inside the active dialog. This keeps them interactive above the modal backdrop without changing the window frame or header layout. Nested dialogs receive the controls until dismissed; dialog positioning reserves space below the bar.

Command failures attempt to restore native decorations. No desktop-only window permissions are granted to mobile, and the global Tauri window configuration retains its decorated default.

Tests cover platform gating, readiness ordering, control dispatch, modal fallback, and fullscreen insets. Native dragging, OS fullscreen, and frame transitions need a packaged desktop smoke check on each target OS.
