//! Repair only the known line-ending variants of the unchanged sync migration.
use sha2::{Digest, Sha384};
use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, SqliteConnection};
use std::{path::Path, sync::OnceLock};
use tauri::{AppHandle, Manager, Runtime};

pub const LIBRARY_SQL: &str = "CREATE TABLE books (id TEXT PRIMARY KEY NOT NULL, metadata TEXT NOT NULL, file TEXT); CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);";
const MIXED_CHECKSUM: &str = "6E591D2B32D3F1E83008CCD03FDEB2645CDF5D0076567549DD81BBEC6623D10D0DEC61DBCE2455C2844585B6AD228528";
const CRLF_CHECKSUM: &str = "C06BDEDB93F51BC01A83DD4C83161E4029374A7B70DF90D7029C054D944E20B8A558D9714315F91DE995B1E322A2C0B8";

pub fn sync_sql() -> &'static str {
    static SQL: OnceLock<String> = OnceLock::new();
    SQL.get_or_init(|| include_str!("sync.sql").replace("\r\n", "\n"))
}

#[tauri::command]
pub async fn prepare_library<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("quire.db");
    repair_existing(&path).await
}

async fn repair_existing(path: &Path) -> Result<(), String> {
    match std::fs::metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Unable to inspect the library: {e}")),
        Ok(metadata) if !metadata.is_file() => return Err("The library path is not a file.".into()),
        Ok(_) => (),
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|e| e.to_string())?;
    let result = repair_checksum(&mut connection).await;
    let closed = connection.close().await;
    result
        .and(closed)
        .map_err(|e| format!("Unable to prepare the library: {e}"))
}

async fn repair_checksum(connection: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let mut tx = connection.begin_with("BEGIN IMMEDIATE").await?;
    let exists: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='_sqlx_migrations'",
    )
    .fetch_one(&mut *tx)
    .await?;
    if exists == 0 {
        tx.rollback().await?;
        return Ok(());
    }
    let migration: Option<(String, bool)> =
        sqlx::query_as("SELECT hex(checksum), success FROM _sqlx_migrations WHERE version=2")
            .fetch_optional(&mut *tx)
            .await?;
    let Some((checksum, true)) = migration else {
        tx.rollback().await?;
        return Ok(());
    };
    if ![MIXED_CHECKSUM, CRLF_CHECKSUM].contains(&checksum.as_str()) {
        tx.rollback().await?;
        return Ok(());
    }
    // Compare SQLite's actual definitions with the unchanged migrations. Extra
    // tables/triggers from later reader features are allowed, but these five
    // definitions must still match before any historical checksum is accepted.
    let mut reference = SqliteConnection::connect("sqlite::memory:").await?;
    reference.execute(LIBRARY_SQL).await?;
    reference.execute(sync_sql()).await?;
    let expected = schema(&mut reference).await?;
    reference.close().await?;
    if schema(&mut tx).await? != expected {
        tx.rollback().await?;
        return Ok(());
    }
    sqlx::query(
        "UPDATE _sqlx_migrations SET checksum=? WHERE version=2 AND success=1 AND hex(checksum)=?",
    )
    .bind(Sha384::digest(sync_sql().as_bytes()).to_vec())
    .bind(checksum)
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

async fn schema(
    connection: &mut SqliteConnection,
) -> Result<Vec<(String, String, String)>, sqlx::Error> {
    let rows: Vec<(String, String, String)> = sqlx::query_as("SELECT type, name, sql FROM sqlite_schema WHERE name IN ('books','preferences','sync_state','sync_commits','apply_sync_commit') ORDER BY name")
        .fetch_all(connection).await?;
    Ok(rows
        .into_iter()
        .map(|(kind, name, sql)| (kind, name, normalize_schema(&sql)))
        .collect())
}

fn normalize_schema(sql: &str) -> String {
    // Only whitespace outside quoted SQL literals/identifiers may differ.
    let mut result = String::new();
    let mut quote = None;
    let mut whitespace = false;
    for c in sql.chars() {
        if let Some(delimiter) = quote {
            result.push(c);
            if c == delimiter {
                quote = None;
            }
        } else if c.is_ascii_whitespace() {
            whitespace = true;
        } else {
            if whitespace && !result.is_empty() {
                result.push(' ');
            }
            whitespace = false;
            result.push(c);
            if matches!(c, '\'' | '"' | '`') {
                quote = Some(c);
            } else if c == '[' {
                quote = Some(']');
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    const CANONICAL_CHECKSUM: &str = "05CA2F4387D888EA1DEC865E278281ACB713E36501575886AD9AE921D70A69EC55C1ACE241A64A6C6E9582E365AEBBD0";

    fn checksum(sql: &str) -> String {
        Sha384::digest(sql.as_bytes())
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect()
    }

    fn variants() -> Vec<String> {
        vec![
            sync_sql().to_owned(),
            format!("{}\r\n", sync_sql().trim_end_matches('\n')),
            sync_sql().replace('\n', "\r\n"),
        ]
    }

    #[test]
    fn pins_migration_bytes_and_known_line_ending_variants() {
        assert!(!sync_sql().contains('\r'));
        let checksums: Vec<_> = variants().iter().map(|sql| checksum(sql)).collect();
        assert_eq!(
            checksums,
            [CANONICAL_CHECKSUM, MIXED_CHECKSUM, CRLF_CHECKSUM]
        );
        assert_eq!(
            normalize_schema("CREATE TABLE a (x TEXT)\r\n"),
            "CREATE TABLE a (x TEXT)"
        );
        assert_ne!(
            normalize_schema("SELECT 'a b'"),
            normalize_schema("SELECT 'a  b'")
        );
    }

    async fn open(path: &Path) -> SqliteConnection {
        SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(false),
        )
        .await
        .unwrap()
    }

    async fn fixture(path: &Path, migration_sql: &str, success: bool) {
        let mut connection = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        connection.execute(LIBRARY_SQL).await.unwrap();
        connection.execute(migration_sql).await.unwrap();
        connection.execute("CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY, description TEXT NOT NULL, installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, success BOOLEAN NOT NULL, checksum BLOB NOT NULL, execution_time BIGINT NOT NULL)").await.unwrap();
        for (version, description, sql, successful) in [
            (1, "local library and device preferences", LIBRARY_SQL, true),
            (2, "atomic reading sync outbox", migration_sql, success),
        ] {
            sqlx::query("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, ?, ?, 42)")
                .bind(version).bind(description).bind(successful).bind(Sha384::digest(sql.as_bytes()).to_vec()).execute(&mut connection).await.unwrap();
        }
        connection.execute("INSERT INTO books VALUES ('one','{\"title\":\"Book One\",\"annotations\":[{\"note\":\"kept\"}],\"position\":{\"fraction\":0.4}}','AQID'); INSERT INTO books VALUES ('two','{\"title\":\"Book Two\",\"folders\":[\"A\",\"B\"]}',NULL); INSERT INTO preferences VALUES (1,'{\"theme\":\"dark\"}'); INSERT INTO sync_state VALUES (1,'{\"cursor\":13,\"pending\":[{\"id\":\"saved\"}]}')").await.unwrap();
        connection.close().await.unwrap();
    }

    async fn snapshot(path: &Path) -> Vec<(String, String)> {
        let mut connection = open(path).await;
        let rows = sqlx::query_as("SELECT 'book',json_array(id,metadata,file) FROM books UNION ALL SELECT 'preferences',json_array(id,value) FROM preferences UNION ALL SELECT 'sync',json_array(id,value) FROM sync_state UNION ALL SELECT 'commits',payload FROM sync_commits UNION ALL SELECT 'migration',json_array(version,description,installed_on,success,hex(checksum),execution_time) FROM _sqlx_migrations ORDER BY 1,2")
            .fetch_all(&mut connection).await.unwrap();
        connection.close().await.unwrap();
        rows
    }

    async fn validate_migrations(path: &Path) -> Result<(), sqlx::migrate::MigrateError> {
        use sqlx::migrate::{Migration, MigrationType, Migrator};
        let migrator = Migrator {
            migrations: vec![
                Migration::new(
                    1,
                    "local library and device preferences".into(),
                    MigrationType::Simple,
                    LIBRARY_SQL.into(),
                    false,
                ),
                Migration::new(
                    2,
                    "atomic reading sync outbox".into(),
                    MigrationType::Simple,
                    sync_sql().into(),
                    false,
                ),
            ]
            .into(),
            ..Migrator::DEFAULT
        };
        let mut connection = open(path).await;
        let result = migrator.run(&mut connection).await;
        connection.close().await.unwrap();
        result
    }

    #[test]
    fn repairs_only_known_checksums_preserving_library_and_migration_history() {
        tauri::async_runtime::block_on(async {
            for migration_sql in variants() {
                let directory = tempfile::tempdir().unwrap();
                let path = directory.path().join("quire.db");
                fixture(&path, &migration_sql, true).await;
                if checksum(&migration_sql) != CANONICAL_CHECKSUM {
                    assert!(matches!(
                        validate_migrations(&path).await,
                        Err(sqlx::migrate::MigrateError::VersionMismatch(2))
                    ));
                }
                let before = snapshot(&path).await;
                repair_existing(&path).await.unwrap();
                validate_migrations(&path).await.unwrap();
                let after = snapshot(&path).await;
                let expected: Vec<_> = before
                    .into_iter()
                    .map(|(kind, row)| {
                        let row = if kind == "migration" {
                            row.replace(&checksum(&migration_sql), CANONICAL_CHECKSUM)
                        } else {
                            row
                        };
                        (kind, row)
                    })
                    .collect();
                assert_eq!(after, expected);
                repair_existing(&path).await.unwrap();
                assert_eq!(snapshot(&path).await, after);
            }
        });
    }

    #[test]
    fn leaves_unknown_failed_and_altered_migrations_unchanged() {
        tauri::async_runtime::block_on(async {
            for alteration in [
                "UPDATE _sqlx_migrations SET checksum=x'010203' WHERE version=2",
                "UPDATE _sqlx_migrations SET success=0 WHERE version=2",
                "DROP TRIGGER apply_sync_commit",
                "ALTER TABLE sync_state ADD COLUMN unexpected TEXT",
                "ALTER TABLE books ADD COLUMN unexpected TEXT",
                "DROP TRIGGER apply_sync_commit; CREATE TRIGGER apply_sync_commit AFTER INSERT ON sync_commits BEGIN DELETE FROM books; END",
            ] {
                let directory = tempfile::tempdir().unwrap();
                let path = directory.path().join("quire.db");
                fixture(&path, &variants()[1], true).await;
                let mut connection = open(&path).await;
                connection.execute(alteration).await.unwrap();
                connection.close().await.unwrap();
                let before = snapshot(&path).await;
                repair_existing(&path).await.unwrap();
                assert_eq!(snapshot(&path).await, before, "{alteration}");
                assert!(validate_migrations(&path).await.is_err(), "{alteration}");
            }
        });
    }

    #[test]
    fn does_not_create_missing_database_or_migration_table() {
        tauri::async_runtime::block_on(async {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("quire.db");
            repair_existing(&path).await.unwrap();
            assert!(!path.exists());
            let connection = SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
            connection.close().await.unwrap();
            repair_existing(&path).await.unwrap();
            let mut connection = open(&path).await;
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sqlite_schema")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!(count, 0);
            connection.close().await.unwrap();
        });
    }
}
