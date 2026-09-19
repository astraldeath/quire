use base64::Engine;
use tauri::ipc::{InvokeBody, Request};
#[cfg(target_os = "ios")]
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use std::io::Write;

enum ExportSource {
    File(std::fs::File),
    Bytes(std::io::Cursor<Vec<u8>>),
}
impl ExportSource {
    fn copy_to(&mut self, destination: &mut impl Write) -> std::io::Result<u64> {
        match self {
            Self::File(file) => std::io::copy(file, destination),
            Self::Bytes(bytes) => std::io::copy(bytes, destination),
        }
    }
}

fn export_name(encoded: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid book filename.")?;
    let name = String::from_utf8(bytes).map_err(|_| "Invalid book filename.")?;
    let (stem, extension) = name.rsplit_once('.').ok_or("Invalid book filename.")?;
    if !["epub", "cbz", "fb2", "fbz", "mobi", "azw3"].contains(&extension) { return Err("Invalid book filename.".into()); }
    if name.len() > 200
        || stem.is_empty()
        || stem.starts_with('.')
        || stem.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Invalid book filename.".into());
    }
    Ok(name)
}

#[tauri::command]
pub async fn export_epub(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let name = export_name(
        request
            .headers()
            .get("x-quire-filename")
            .and_then(|value| value.to_str().ok())
            .ok_or("Missing book filename.")?,
    )?;
    let mut source = if let Some(reference) = request.headers().get("x-quire-file-reference") {
        let reference = reference.to_str().map_err(|_| "Invalid book reference.")?;
        let file = std::fs::File::open(crate::book_files::file_path(&app, reference)?)
            .map_err(|_| "The book file is unavailable.")?;
        ExportSource::File(file)
    } else {
        match request.body() {
            InvokeBody::Raw(bytes) if !bytes.is_empty() => ExportSource::Bytes(std::io::Cursor::new(bytes.clone())),
            _ => return Err("Invalid or empty book.".into()),
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        // Tauri's iOS picker exports a pre-existing Documents file. Create it
        // exclusively so an existing file can never be overwritten or removed.
        #[cfg(target_os = "ios")]
        let (name, source) = {
            let directory = app
                .path()
                .document_dir()
                .map_err(|_| "Could not prepare book export.")?;
            let mut index = 0u32;
            loop {
                let candidate = if index == 0 {
                    name.clone()
                } else {
                    format!("{} ({index}).{}", name.rsplit_once('.').unwrap().0, name.rsplit_once('.').unwrap().1)
                };
                let path = directory.join(&candidate);
                match std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&path)
                {
                    Ok(mut file) => {
                        if source.copy_to(&mut file).is_err() {
                            drop(file);
                            let _ = std::fs::remove_file(&path);
                            return Err("Could not prepare book export.".into());
                        }
                        break (candidate, path);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                        index = index
                            .checked_add(1)
                            .ok_or("Could not prepare book export.")?;
                    }
                    Err(_) => return Err("Could not prepare book export.".into()),
                }
            }
        };
        let destination = app
            .dialog()
            .file()
            .set_file_name(&name)
            .add_filter("Book", &[name.rsplit_once('.').unwrap().1])
            .blocking_save_file();
        #[cfg(target_os = "ios")]
        {
            let _ = std::fs::remove_file(source);
            Ok(destination.is_some())
        }
        #[cfg(not(target_os = "ios"))]
        match destination {
            Some(path) => {
                let path = path
                    .into_path()
                    .map_err(|_| "Could not save book to this location.")?;
                let mut destination = std::fs::File::create(path).map_err(|_| "Could not save book to this location.")?;
                source.copy_to(&mut destination).map_err(|_| "Could not save book to this location.")?;
                Ok(true)
            }
            None => Ok(false),
        }
    })
    .await
    .map_err(|_| "Could not export book.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn name(value: &str) -> Result<String, String> {
        export_name(&base64::engine::general_purpose::STANDARD.encode(value))
    }
    #[test]
    fn accepts_unicode_and_rejects_paths_and_oversized_names() {
        assert_eq!(name("旅の本.epub").unwrap(), "旅の本.epub");
        for invalid in [
            "../book.epub",
            "C:\\book.epub",
            ".epub",
            "book.txt",
            "book\0.epub",
        ] {
            assert!(name(invalid).is_err());
        }
        assert!(name(&format!("{}.epub", "x".repeat(201))).is_err());
    }

    #[test]
    fn copies_large_local_books_without_loading_the_file_into_memory() {
        use std::io::{Seek, SeekFrom};
        let mut file = tempfile::tempfile().unwrap();
        let size = 129 * 1024 * 1024;
        file.set_len(size).unwrap();
        file.seek(SeekFrom::Start(size - 1)).unwrap();
        file.write_all(&[123]).unwrap();
        file.seek(SeekFrom::Start(0)).unwrap();
        let mut source = ExportSource::File(file);
        assert_eq!(source.copy_to(&mut std::io::sink()).unwrap(), size);
    }
}
