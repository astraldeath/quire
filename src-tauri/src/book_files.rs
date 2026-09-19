//! Immutable book objects. SQLite stores only their opaque identifier.
use std::{
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager,
};

const CHUNK: usize = 1024 * 1024;
pub fn file_path(app: &tauri::AppHandle, reference: &str) -> Result<PathBuf, String> {
    let id = reference
        .strip_prefix("@quire-file:")
        .ok_or("Invalid book file reference.")?;
    path(&root(app)?, id, false)
}
// Prevent append/finalize races, including calls from separate webviews.
static WRITES: Mutex<()> = Mutex::new(());

fn path(root: &Path, id: &str, staging: bool) -> Result<PathBuf, String> {
    if id.len() != 64
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("Invalid book file identifier.".into());
    }
    Ok(root.join(format!("{id}.{}", if staging { "part" } else { "book" })))
}
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("book-files");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}
fn begin(root: &Path) -> Result<String, String> {
    let mut random = [0u8; 32];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let id: String = random.iter().map(|b| format!("{b:02x}")).collect();
    if path(root, &id, false)?.exists() {
        return Err("Book identifier collision.".into());
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path(root, &id, true)?)
        .map_err(|e| e.to_string())?;
    Ok(id)
}
fn append(root: &Path, id: &str, offset: u64, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > CHUNK {
        return Err("Invalid book chunk.".into());
    }
    let mut file = OpenOptions::new()
        .append(true)
        .open(path(root, id, true)?)
        .map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() != offset {
        return Err("Unexpected book chunk offset.".into());
    }
    file.write_all(bytes).map_err(|e| e.to_string())
}
fn finish(root: &Path, id: &str, size: u64) -> Result<(), String> {
    let source = path(root, id, true)?;
    let file = OpenOptions::new()
        .write(true)
        .open(&source)
        .map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() != size {
        return Err("Incomplete book file.".into());
    }
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    let destination = path(root, id, false)?;
    if destination.exists() {
        return Err("Book file already exists.".into());
    }
    fs::rename(source, destination).map_err(|e| e.to_string())
}
fn remove(root: &Path, id: &str, staging: bool) -> Result<(), String> {
    match fs::remove_file(path(root, id, staging)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
pub async fn book_file_begin(app: tauri::AppHandle) -> Result<String, String> {
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    begin(&root(&app)?)
}
#[tauri::command]
pub async fn book_file_append(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-quire-file")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing book identifier.")?;
    let offset = request
        .headers()
        .get("x-quire-offset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or("Invalid book offset.")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Expected binary book chunk.".into()),
    };
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    append(&root(&app)?, id, offset, bytes)
}
#[tauri::command]
pub async fn book_file_finish(app: tauri::AppHandle, id: String, size: u64) -> Result<(), String> {
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    finish(&root(&app)?, &id, size)
}
#[tauri::command]
pub async fn book_file_abort(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    remove(&root(&app)?, &id, true)
}
#[tauri::command]
pub async fn book_file_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    remove(&root(&app)?, &id, false)
}
#[tauri::command]
pub async fn book_file_size(app: tauri::AppHandle, id: String) -> Result<u64, String> {
    fs::metadata(path(&root(&app)?, &id, false)?)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn book_file_read(
    app: tauri::AppHandle,
    id: String,
    offset: u64,
    length: usize,
) -> Result<Response, String> {
    if length == 0 || length > CHUNK {
        return Err("Invalid book read size.".into());
    }
    let mut file = fs::File::open(path(&root(&app)?, &id, false)?).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn immutable_objects_validate_chunks_and_keep_previous_version() {
        let dir = tempfile::tempdir().unwrap();
        let old = begin(dir.path()).unwrap();
        append(dir.path(), &old, 0, b"old").unwrap();
        finish(dir.path(), &old, 3).unwrap();
        let new = begin(dir.path()).unwrap();
        assert_ne!(old, new);
        assert!(append(dir.path(), &new, 1, b"bad").is_err());
        let chunk = vec![42; CHUNK];
        for i in 0..129 {
            append(dir.path(), &new, i * CHUNK as u64, &chunk).unwrap();
        }
        assert!(finish(dir.path(), &new, 1).is_err());
        finish(dir.path(), &new, 129 * CHUNK as u64).unwrap();
        assert!(append(dir.path(), &new, 129 * CHUNK as u64, b"bad").is_err());
        assert_eq!(
            fs::read(path(dir.path(), &old, false).unwrap()).unwrap(),
            b"old"
        );
        remove(dir.path(), &new, false).unwrap();
        assert!(path(dir.path(), &old, false).unwrap().exists());
        assert!(path(dir.path(), "../outside", false).is_err());
    }
}
