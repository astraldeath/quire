#[tauri::command]
pub fn updates_info(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "supported": cfg!(target_os = "windows") || (cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some_and(|path| !path.is_empty()))
    })
}

// All native builds can check releases, even without an updater plugin.
// The webview cannot choose a URL or attach account credentials to this request.
#[tauri::command]
pub async fn updates_latest() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Quire-reader-update-check")
        .build()
        .map_err(|_| "Could not check reader releases.".to_string())?;
    let mut response = client
        .get("https://api.github.com/repos/astraldeath/quire/releases/latest")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "Could not check reader releases.".to_string())?;
    if !response.status().is_success() {
        return Err("Could not check reader releases.".into());
    }
    // Release metadata includes asset lists; bound it before JSON decoding.
    const MAX_BYTES: usize = 1024 * 1024;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read reader release.".to_string())?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
            return Err("Reader release information is too large.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid reader release information.".into())
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
