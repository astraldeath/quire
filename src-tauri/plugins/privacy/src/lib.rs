#[cfg(target_os = "ios")]
use tauri::{plugin::PluginHandle, Manager, State};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_privacy);
#[cfg(target_os = "ios")]
struct Privacy<R: Runtime>(PluginHandle<R>);

#[cfg(target_os = "ios")]
#[tauri::command]
async fn configure<R: Runtime>(state: State<'_, Privacy<R>>, shield: bool) -> Result<(), String> {
    state
        .0
        .run_mobile_plugin::<serde_json::Value>("configure", serde_json::json!({"shield": shield}))
        .map(|_| ())
        .map_err(|e| e.to_string())
}
#[cfg(target_os = "ios")]
#[tauri::command]
async fn available<R: Runtime>(state: State<'_, Privacy<R>>) -> Result<bool, String> {
    let value = state
        .0
        .run_mobile_plugin::<serde_json::Value>("available", serde_json::json!({}))
        .map_err(|e| e.to_string())?;
    Ok(value
        .get("available")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
#[cfg(target_os = "ios")]
#[tauri::command]
async fn authenticate<R: Runtime>(state: State<'_, Privacy<R>>) -> Result<bool, String> {
    let value = state
        .0
        .run_mobile_plugin::<serde_json::Value>("authenticate", serde_json::json!({}))
        .map_err(|e| e.to_string())?;
    Ok(value
        .get("authenticated")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = Builder::new("privacy");
    #[cfg(target_os = "ios")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![configure, available, authenticate])
        .setup(|app, api| {
            app.manage(Privacy(api.register_ios_plugin(init_plugin_privacy)?));
            Ok(())
        });
    builder.build()
}
