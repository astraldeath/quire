#[cfg(target_os = "ios")]
use tauri::{plugin::PluginHandle, Manager};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_privacy);
#[cfg(target_os = "ios")]
struct Privacy<R: Runtime>(PluginHandle<R>);

fn native_call<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
        app.state::<Privacy<R>>()
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, command, payload);
        Err("Native privacy controls are only available on iOS.".into())
    }
}

// AppHandle ties the command's runtime to the Invoke runtime. State<T> alone
// cannot infer R. Keep registration platform-independent so desktop CI checks it.
#[tauri::command]
async fn configure<R: Runtime>(app: AppHandle<R>, shield: bool) -> Result<(), String> {
    native_call(&app, "configure", serde_json::json!({"shield": shield})).map(|_| ())
}
#[tauri::command]
async fn available<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let value = native_call(&app, "available", serde_json::json!({}))?;
    Ok(value
        .get("available")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
#[tauri::command]
async fn authenticate<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let value = native_call(&app, "authenticate", serde_json::json!({}))?;
    Ok(value
        .get("authenticated")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = Builder::new("privacy").invoke_handler(tauri::generate_handler![
        configure,
        available,
        authenticate
    ]);
    #[cfg(target_os = "ios")]
    let builder = builder.setup(|app, api| {
        app.manage(Privacy(api.register_ios_plugin(init_plugin_privacy)?));
        Ok(())
    });
    builder.build()
}
