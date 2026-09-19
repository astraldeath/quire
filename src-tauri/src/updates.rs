#[tauri::command]
pub fn updates_info(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "supported": cfg!(target_os = "windows") || (cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some_and(|path| !path.is_empty()))
    })
}

// The Windows installer handles its own restart. Linux replaces the AppImage
// in place, so restart only after the signed installation has returned.
#[tauri::command]
pub fn updates_restart(app: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    app.restart();
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
