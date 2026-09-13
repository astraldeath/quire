mod backup;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backup::export_backup])
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:quire.db", vec![Migration {
            version: 1,
            description: "local library and device preferences",
            sql: "CREATE TABLE books (id TEXT PRIMARY KEY NOT NULL, metadata TEXT NOT NULL, file TEXT); CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);",
            kind: MigrationKind::Up,
        }]).build())
        .run(tauri::generate_context!())
        .expect("failed to run Quire");
}
