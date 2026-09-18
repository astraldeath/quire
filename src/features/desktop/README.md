# Desktop window controls

The native build target enables the custom window bar; browsers and iOS/Android do not render it. The bar uses the app theme, supports dragging and double-click maximize, and includes minimize, maximize/restore, and close controls. Fullscreen removes the bar and content inset.

Native decorations remain enabled until the frontend bar has mounted. A page navigation restores decorations before the new frontend loads. Native controls also return while an HTML modal dialog (including the privacy shield) is open, because modal top-layer inertness would disable controls outside the dialog. Dismissal restores the custom bar. The temporary native bar can change client height according to the OS decoration size.

Command failures attempt to restore native decorations. No desktop-only window permissions are granted to mobile, and the global Tauri window configuration retains its decorated default.

Tests cover platform gating, readiness ordering, control dispatch, modal fallback, and fullscreen insets. Native dragging, OS fullscreen, and frame transitions need a packaged desktop smoke check on each target OS.
