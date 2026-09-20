//! OS file-open inbox. Only native launch events can grant a readable handle.
use serde::Serialize;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

const CHUNK: usize = 1024 * 1024;
const MAX_PENDING: usize = 64;

#[derive(Clone, Serialize)]
pub struct OpenFile {
    id: String,
    name: String,
    size: u64,
    error: Option<String>,
}
struct Entry {
    info: OpenFile,
    path: PathBuf,
    file: Option<File>,
}
#[derive(Default)]
pub struct Inbox(Mutex<Vec<Entry>>);

fn supported(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    [
        ".epub", ".cbz", ".cbr", ".cb7", ".fb2", ".fbz", ".fb2.zip", ".mobi", ".azw3", ".pdf",
    ]
    .iter()
    .any(|ext| name.ends_with(ext))
}

fn enqueue(inbox: &mut Vec<Entry>, path: PathBuf) {
    if !supported(&path)
        || inbox.len() >= MAX_PENDING
        || inbox.iter().any(|entry| entry.path == path)
    {
        return;
    }
    let mut random = [0u8; 16];
    if getrandom::fill(&mut random).is_err() {
        return;
    }
    let id = random.iter().map(|b| format!("{b:02x}")).collect();
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let opened = std::fs::metadata(&path)
        .and_then(|meta| {
            if !meta.is_file() {
                return Err(std::io::Error::other("Choose a regular book file."));
            }
            File::open(&path)
        })
        .and_then(|file| {
            let meta = file.metadata()?;
            if !meta.is_file() || meta.len() == 0 {
                return Err(std::io::Error::other("Choose a non-empty book file."));
            }
            Ok((file, meta.len()))
        });
    let (file, size, error) = match opened {
        Ok((file, size)) => (Some(file), size, None),
        Err(e) => (None, 0, Some(format!("Could not open {name}: {e}"))),
    };
    inbox.push(Entry {
        info: OpenFile {
            id,
            name,
            size,
            error,
        },
        path,
        file,
    });
}

pub fn queue(app: &tauri::AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let state = app.state::<Inbox>();
    if let Ok(mut inbox) = state.0.lock() {
        for path in paths {
            enqueue(&mut inbox, path);
        }
    }
    // A notification is only a hint: the inbox survives frontend startup/reload.
    let _ = app.emit("desktop-open-files", ());
}

#[cfg(desktop)]
pub fn arguments(app: &tauri::AppHandle, args: impl IntoIterator<Item = String>, cwd: &Path) {
    queue(app, argument_paths(args, cwd));
}
#[cfg(desktop)]
fn argument_paths(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            if arg.starts_with("file://") {
                return tauri::Url::parse(&arg).ok()?.to_file_path().ok();
            }
            if arg.contains("://") {
                return None;
            }
            let path = PathBuf::from(arg);
            if path.is_absolute() {
                Some(path)
            } else {
                Some(cwd.join(path))
            }
        })
        .filter(|path| supported(path))
        .collect()
}

#[tauri::command]
pub fn desktop_open_pending(state: tauri::State<'_, Inbox>) -> Result<Vec<OpenFile>, String> {
    Ok(state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|e| e.info.clone())
        .collect())
}
fn read(entry: &mut Entry, offset: u64, length: usize) -> Result<Vec<u8>, String> {
    if length == 0
        || length > CHUNK
        || offset
            .checked_add(length as u64)
            .is_none_or(|end| end > entry.info.size)
    {
        return Err("Invalid book read range.".into());
    }
    let file = entry.file.as_mut().ok_or("Book file is unavailable.")?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes)
}
#[tauri::command]
pub fn desktop_open_read(
    state: tauri::State<'_, Inbox>,
    id: String,
    offset: u64,
    length: usize,
) -> Result<tauri::ipc::Response, String> {
    let mut inbox = state.0.lock().map_err(|e| e.to_string())?;
    let entry = inbox
        .iter_mut()
        .find(|e| e.info.id == id)
        .ok_or("Unknown book handle.")?;
    Ok(tauri::ipc::Response::new(read(entry, offset, length)?))
}
#[tauri::command]
pub fn desktop_open_release(state: tauri::State<'_, Inbox>, id: String) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .retain(|e| e.info.id != id);
    Ok(())
}
#[tauri::command]
pub fn desktop_file_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "mobile"
    }
}
#[tauri::command]
pub fn desktop_default_apps(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url("ms-settings:defaultapps", None::<&str>)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Choose Quire from your file manager's Open With settings.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_book_extensions_and_valid_regular_files_are_accepted() {
        assert!(supported(Path::new("BOOK.PDF")));
        assert!(supported(Path::new("Comic.CBR")));
        assert!(supported(Path::new("Comic.CB7")));
        assert!(supported(Path::new("book.fb2.zip")));
        assert!(!supported(Path::new("archive.zip")));
        assert!(!supported(Path::new("file.exe")));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.cbr");
        std::fs::write(&path, b"book").unwrap();
        let mut inbox = Vec::new();
        enqueue(&mut inbox, path.clone());
        enqueue(&mut inbox, path);
        assert_eq!(inbox.len(), 1);
        assert_eq!(read(&mut inbox[0], 1, 2).unwrap(), b"oo");
        assert!(read(&mut inbox[0], 0, CHUNK + 1).is_err());
        assert!(read(&mut inbox[0], u64::MAX, 2).is_err());
        assert!(read(&mut inbox[0], 3, 2).is_err());
        enqueue(&mut inbox, dir.path().join("missing.cb7"));
        assert!(inbox[1].info.error.is_some());
    }
    #[test]
    fn queue_is_bounded_without_discarding_earlier_requests() {
        let mut inbox = Vec::new();
        for i in 0..MAX_PENDING + 2 {
            enqueue(&mut inbox, PathBuf::from(format!("{i}.pdf")));
        }
        assert_eq!(inbox.len(), MAX_PENDING);
        assert_eq!(inbox[0].info.name, "0.pdf");
    }
    #[test]
    #[cfg(desktop)]
    fn desktop_uri_arguments_decode_local_files_without_accepting_remote_urls() {
        let cwd = std::env::current_dir().unwrap();
        let path = cwd.join("a book #1.pdf");
        let uri = tauri::Url::from_file_path(&path).unwrap().to_string();
        assert_eq!(
            argument_paths(
                vec!["quire".into(), uri, "https://example.com/book.pdf".into()],
                &cwd
            ),
            vec![path]
        );
    }
    #[test]
    fn linux_launchers_forward_files_and_keep_mime_registration() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.linux.conf.json")).unwrap();
        for package in ["deb", "rpm"] {
            assert_eq!(
                config["bundle"]["linux"][package]["desktopTemplate"],
                "linux/quire.desktop"
            );
        }
        let template = include_str!("../linux/quire.desktop");
        assert!(template.lines().any(|line| line == "Exec={{exec}} %U"));
        assert!(template
            .lines()
            .any(|line| line == "MimeType={{mime_type}}"));
    }
    #[test]
    #[cfg(desktop)]
    fn launch_arguments_resolve_relative_books_and_ignore_protocols_and_options() {
        let cwd = std::env::current_dir().unwrap();
        let absolute = cwd.join("absolute.epub");
        let args = vec![
            "quire.exe".into(),
            "a book.PDF".into(),
            absolute.to_string_lossy().into_owned(),
            "--flag.pdf".into(),
            "app.quire.reader://oauth/test.pdf".into(),
            "backup.zip".into(),
        ];
        assert_eq!(
            argument_paths(args, &cwd),
            vec![cwd.join("a book.PDF"), absolute]
        );
    }
}
