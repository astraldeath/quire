mod backup;
mod sync;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(mobile)]
            _app.handle().plugin(tauri_plugin_haptics::init())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backup::export_backup, sync::sync_discover, sync::sync_login, sync::sync_call, sync::sync_logout, sync::sync_files, sync::sync_upload, sync::sync_download, sync::sync_metadata])
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:quire.db", vec![Migration {
            version: 1,
            description: "local library and device preferences",
            sql: "CREATE TABLE books (id TEXT PRIMARY KEY NOT NULL, metadata TEXT NOT NULL, file TEXT); CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);",
            kind: MigrationKind::Up,
        }, Migration { version: 2, description: "atomic reading sync outbox", sql: include_str!("sync.sql"), kind: MigrationKind::Up }]).build())
        .run(tauri::generate_context!())
        .expect("failed to run Quire");
}
