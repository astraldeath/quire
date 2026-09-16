use base64::Engine;
use tauri::ipc::{InvokeBody, Request};
#[cfg(target_os = "ios")]
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn export_name(encoded: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid EPUB filename.")?;
    let name = String::from_utf8(bytes).map_err(|_| "Invalid EPUB filename.")?;
    let stem = name.strip_suffix(".epub").ok_or("Invalid EPUB filename.")?;
    if name.len() > 200
        || stem.is_empty()
        || stem.starts_with('.')
        || stem.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Invalid EPUB filename.".into());
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
            .ok_or("Missing EPUB filename.")?,
    )?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= 128 * 1024 * 1024 => {
            bytes.clone()
        }
        _ => return Err("Invalid or oversized EPUB.".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        // Tauri's iOS picker exports a pre-existing Documents file. Create it
        // exclusively so an existing file can never be overwritten or removed.
        #[cfg(target_os = "ios")]
        let (name, source) = {
            use std::io::Write;
            let directory = app
                .path()
                .document_dir()
                .map_err(|_| "Could not prepare EPUB export.")?;
            let mut index = 0u32;
            loop {
                let candidate = if index == 0 {
                    name.clone()
                } else {
                    format!("{} ({index}).epub", name.trim_end_matches(".epub"))
                };
                let path = directory.join(&candidate);
                match std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&path)
                {
                    Ok(mut file) => {
                        if file.write_all(&bytes).is_err() {
                            drop(file);
                            let _ = std::fs::remove_file(&path);
                            return Err("Could not prepare EPUB export.".into());
                        }
                        break (candidate, path);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                        index = index
                            .checked_add(1)
                            .ok_or("Could not prepare EPUB export.")?;
                    }
                    Err(_) => return Err("Could not prepare EPUB export.".into()),
                }
            }
        };
        let destination = app
            .dialog()
            .file()
            .set_file_name(&name)
            .add_filter("EPUB book", &["epub"])
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
                    .map_err(|_| "Could not save EPUB to this location.")?;
                std::fs::write(path, bytes).map_err(|_| "Could not save EPUB to this location.")?;
                Ok(true)
            }
            None => Ok(false),
        }
    })
    .await
    .map_err(|_| "Could not export EPUB.".to_string())?
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
}
