use serde::Serialize;
use std::{fs, path::Path, sync::Mutex};
use tauri::Manager;

pub struct CapturePreference(Mutex<bool>);
#[derive(Serialize)]
pub struct CaptureStatus {
    support: &'static str,
    enabled: bool,
}
fn support() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unavailable"
    }
}
fn supported() -> bool {
    matches!(support(), "windows" | "macos")
}
fn read(path: &Path) -> Result<bool, String> {
    match fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| "Invalid screen capture preference.".into())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
fn save(path: &Path, enabled: bool) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Invalid preference path")?)
        .map_err(|e| e.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, if enabled { "true" } else { "false" }).map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}
fn apply(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    for window in app.webview_windows().values() {
        window
            .set_content_protected(enabled)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = (app, enabled);
    Ok(())
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let enabled = if supported() {
        read(&app.path().app_config_dir()?.join("capture-protection.json"))?
    } else {
        false
    };
    apply(app, enabled)?;
    app.manage(CapturePreference(Mutex::new(enabled)));
    Ok(())
}
#[tauri::command]
pub fn screen_capture(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: Option<bool>,
) -> Result<CaptureStatus, String> {
    if window.label() != "main" {
        return Err("Screen capture settings are only available in the main window.".into());
    }
    let state = app.state::<CapturePreference>();
    let mut current = state
        .0
        .lock()
        .map_err(|_| "Screen capture settings are unavailable.")?;
    if let Some(enabled) = enabled {
        if !supported() {
            return Err("Screen capture protection is unavailable on this platform.".into());
        }
        let path = app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join("capture-protection.json");
        if let Err(error) = apply(&app, enabled).and_then(|_| save(&path, enabled)) {
            let _ = apply(&app, *current);
            return Err(error);
        }
        *current = enabled;
    }
    Ok(CaptureStatus {
        support: support(),
        enabled: *current,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preference_defaults_off_and_persists_both_states() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings/capture-protection.json");
        assert!(!read(&path).unwrap());
        save(&path, true).unwrap();
        assert!(read(&path).unwrap());
        save(&path, false).unwrap();
        assert!(!read(&path).unwrap());
        fs::write(path, "invalid").unwrap();
        assert!(read(&directory.path().join("settings/capture-protection.json")).is_err());
    }
}
