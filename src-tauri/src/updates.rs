#[tauri::command]
pub fn updates_info(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "supported": cfg!(target_os = "windows")
    })
}
