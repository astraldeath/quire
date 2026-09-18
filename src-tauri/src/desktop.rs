use serde::Serialize;

#[derive(Serialize)]
pub struct DesktopWindowState {
    desktop: bool,
    maximized: bool,
    fullscreen: bool,
    decorated: bool,
}

#[tauri::command]
pub fn desktop_window(
    window: tauri::WebviewWindow,
    action: String,
) -> Result<DesktopWindowState, String> {
    #[cfg(desktop)]
    {
        if window.label() != "main" {
            return Err("Window controls are only available in the main window".into());
        }
        let result = match action.as_str() {
            "state" => Ok(()),
            "custom" => window.set_decorations(false),
            "native" => window.set_decorations(true),
            "minimize" => window.minimize(),
            "maximize" => window.is_maximized().and_then(|maximized| {
                if maximized {
                    window.unmaximize()
                } else {
                    window.maximize()
                }
            }),
            "close" => window.close(),
            "drag" => window.start_dragging(),
            _ => return Err("Unknown window action".into()),
        };
        result.map_err(|error| error.to_string())?;
        Ok(DesktopWindowState {
            desktop: true,
            maximized: window.is_maximized().map_err(|error| error.to_string())?,
            fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
            decorated: window.is_decorated().map_err(|error| error.to_string())?,
        })
    }
    #[cfg(mobile)]
    {
        let _ = (window, action);
        Ok(DesktopWindowState {
            desktop: false,
            maximized: false,
            fullscreen: false,
            decorated: true,
        })
    }
}

// A reload must not strand a failed frontend in an undecorated window.
pub fn page_load(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<'_>) {
    #[cfg(desktop)]
    if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
        let _ = webview.window().set_decorations(true);
    }
    #[cfg(mobile)]
    let _ = (webview, payload);
}
