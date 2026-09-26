//! Family names only: native font files and bytes never cross the IPC boundary.

use std::sync::Mutex;

// Enumerating installed fonts can involve disk/font-server access. Cache successful
// discovery for this process, serialize concurrent callers, and allow error retries.
static FAMILIES: Mutex<Option<Vec<String>>> = Mutex::new(None);

#[tauri::command]
pub async fn system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut cached = FAMILIES
            .lock()
            .map_err(|_| "System font cache unavailable")?;
        if let Some(families) = cached.as_ref() {
            return Ok(families.clone());
        }
        let families = normalize_families(discover_families()?);
        *cached = Some(families.clone());
        Ok(families)
    })
    .await
    .map_err(|error| format!("System font discovery failed: {error}"))?
}

fn normalize_families(families: Vec<String>) -> Vec<String> {
    let mut families: Vec<_> = families
        .into_iter()
        .map(|family| family.trim().to_owned())
        .filter(|family| {
            !family.is_empty()
                && family.encode_utf16().count() <= 180
                && !family.chars().any(char::is_control)
        })
        .collect();
    families.sort_by_cached_key(|family| (family.to_lowercase(), family.clone()));
    families.dedup_by(|a, b| a.to_lowercase() == b.to_lowercase());
    families
}

#[cfg(not(target_os = "android"))]
fn discover_families() -> Result<Vec<String>, String> {
    // DirectWrite (Windows), CoreText (macOS/iOS), fontconfig (Linux).
    font_kit::source::SystemSource::new()
        .all_families()
        .map_err(|error| format!("Could not enumerate system fonts: {error}"))
}

#[cfg(target_os = "android")]
fn discover_families() -> Result<Vec<String>, String> {
    // These are Android's font mappings, also used by Skia. Internal OpenType
    // family names from /system/fonts may not be addressable by WebView CSS.
    // Unnamed language fallbacks deliberately aren't offered as selectable names.
    let primary = ["/system/etc/fonts.xml", "/system/etc/font_fallback.xml"]
        .into_iter()
        .find_map(|path| std::fs::read_to_string(path).ok())
        .ok_or("Could not read Android's system font configuration")?;
    let mut families = android_family_names(&primary)?;
    for path in [
        "/product/etc/fonts_customization.xml",
        "/vendor/etc/fallback_fonts.xml",
    ] {
        match std::fs::read_to_string(path) {
            Ok(xml) => families.extend(android_family_names(&xml)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not read Android's additional font configuration".into()),
        }
    }
    Ok(families)
}

#[cfg(any(target_os = "android", test))]
fn android_family_names(xml: &str) -> Result<Vec<String>, String> {
    use quick_xml::{events::Event, Reader};

    let mut reader = Reader::from_str(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut families = Vec::new();
    let mut depth = 0usize;
    loop {
        match reader
            .read_event()
            .map_err(|_| "Invalid Android font configuration")?
        {
            Event::Start(element) => {
                depth += 1;
                let name = element.name();
                if matches!(name.as_ref(), "family" | "family-list" | "alias") {
                    for attr in element.attributes() {
                        let attr = attr.map_err(|_| "Invalid Android font attributes")?;
                        if attr.key.as_ref() == "name" {
                            families.push(
                                attr.normalized_value(quick_xml::XmlVersion::Implicit1_0)
                                    .map_err(|_| "Invalid Android font family name")?
                                    .into_owned(),
                            );
                        }
                    }
                }
            }
            Event::End(_) => depth -= 1,
            Event::Eof if depth == 0 => break,
            Event::Eof => return Err("Incomplete Android font configuration".into()),
            _ => {}
        }
    }
    Ok(families)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn families_are_sorted_deduplicated_and_valid() {
        let families = [
            " zeta ",
            "Arial",
            "arial",
            "",
            "  ",
            "Noto Sans",
            "Bad\0Name",
            "宋体",
        ]
        .map(str::to_owned)
        .to_vec();
        assert_eq!(
            normalize_families(families),
            ["Arial", "Noto Sans", "zeta", "宋体"]
        );
    }

    #[test]
    fn android_reads_named_families_aliases_and_family_lists() {
        let xml = r#"<familyset version="23">
            <family name="sans-serif"><font weight="400">Roboto-Regular.ttf</font></family>
            <family lang="und-Arab"><font>NotoNaskhArabic.ttf</font></family>
            <alias name="sans-serif-light" to="sans-serif" weight="300"/>
            <family-list name="serif"><family><font>NotoSerif.ttf</font></family></family-list>
            <family name="A &amp; B"><font>Custom.ttf</font></family>
        </familyset>"#;
        assert_eq!(
            android_family_names(xml).unwrap(),
            ["sans-serif", "sans-serif-light", "serif", "A & B"]
        );
    }

    #[test]
    fn android_rejects_malformed_configuration() {
        assert!(android_family_names("<familyset><family name='a'></familyset>").is_err());
        assert!(android_family_names("<familyset><family name='a'>").is_err());
    }

    #[test]
    fn excessively_long_names_cannot_be_selected_by_the_frontend() {
        assert!(normalize_families(vec!["a".repeat(181), "𐀀".repeat(91)]).is_empty());
    }

    #[cfg(not(target_os = "android"))]
    #[test]
    #[ignore = "requires installed fonts on the host"]
    fn installed_families_can_be_enumerated() {
        let families = normalize_families(discover_families().unwrap());
        assert!(!families.is_empty());
        println!("Enumerated {} installed families", families.len());
    }
}
