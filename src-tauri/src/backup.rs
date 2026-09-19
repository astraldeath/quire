use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "ios")]
use tauri::Manager;

#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, reference: String) -> Result<bool, String> {
    let staged = crate::book_files::file_path(&app, &reference)?;
    tauri::async_runtime::spawn_blocking(move || {
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
        let name = format!("quire-{timestamp}.quire-backup");
        // iOS exports an existing Documents file; writing after the picker would
        // export an empty archive to cloud providers. See Tauri's saveFileDialog.
        #[cfg(target_os = "ios")]
        let source = {
            let source = app.path().document_dir().map_err(|e| e.to_string())?.join(&name);
            std::fs::copy(&staged, &source).map_err(|e| e.to_string())?;
            source
        };
        let path = app.dialog().file().set_file_name(&name).add_filter("Quire backup", &["quire-backup"]).blocking_save_file();
        #[cfg(target_os = "ios")]
        {
            let _ = std::fs::remove_file(&source);
            Ok(path.is_some())
        }
        #[cfg(not(target_os = "ios"))]
        {
            match path {
                Some(path) => {
                    let path = path.into_path().map_err(|e| e.to_string())?;
                    std::fs::copy(staged, path).map_err(|e| e.to_string())?;
                    Ok(true)
                }
                None => Ok(false),
            }
        }
    }).await.map_err(|e| e.to_string())?
}
