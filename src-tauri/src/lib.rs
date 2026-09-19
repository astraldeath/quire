mod backup;
mod book_files;
mod desktop;
mod updates;
mod epub_export;
mod sync;
mod tracking;
mod migrations;

use tauri_plugin_sql::{Migration, MigrationKind};
#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .on_page_load(desktop::page_load)
        .plugin(tauri_plugin_privacy::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            #[cfg(desktop)]
            _app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(mobile)]
            _app.handle().plugin(tauri_plugin_haptics::init())?;
            tracking::setup(_app.handle())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![book_files::book_file_begin, book_files::book_file_append, book_files::book_file_finish, book_files::book_file_abort, book_files::book_file_remove, book_files::book_file_size, book_files::book_file_read, migrations::prepare_library, desktop::desktop_window, updates::updates_info, updates::updates_restart, sync::updates_call, backup::export_backup, epub_export::export_epub, sync::sync_discover, sync::sync_login, sync::sync_call, sync::statistics_call, sync::privacy_call, sync::sync_logout, sync::sync_files, sync::sync_upload, sync::sync_download, sync::sync_metadata, tracking::tracking_status, tracking::tracking_connect, tracking::tracking_disconnect, tracking::tracking_provider])
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:quire.db", vec![Migration {
            version: 1,
            description: "local library and device preferences",
            sql: migrations::LIBRARY_SQL,
            kind: MigrationKind::Up,
        }, Migration { version: 2, description: "atomic reading sync outbox", sql: migrations::sync_sql(), kind: MigrationKind::Up }]).build())
        .run(tauri::generate_context!())
        .expect("failed to run Quire");
}
