//! Native OPDS transport with origin-bound credentials and scoped downloads.
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::Emitter;
use tokio::sync::watch;

#[derive(Deserialize, Serialize, Clone)]
pub struct Credentials {
    username: String,
    password: String,
}
#[derive(Deserialize, Serialize)]
struct SavedCredentials {
    origin: String,
    credentials: Credentials,
}
fn catalog_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid catalog URL.")?;
    if value.len() > 8192
        || !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("Use an HTTP or HTTPS catalog URL without credentials or a fragment.".into());
    }
    Ok(url)
}
fn redirect_url(previous: &Url, location: &str) -> Result<Url, String> {
    let next = catalog_url(
        previous
            .join(location)
            .map_err(|_| "Invalid catalog redirect.")?
            .as_str(),
    )?;
    if previous.scheme() == "https" && next.scheme() != "https" {
        return Err("Catalog redirect would downgrade a secure connection.".into());
    }
    Ok(next)
}
fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid catalog request identifier.".into());
    }
    Ok(())
}
fn secure_platform() -> bool {
    cfg!(any(
        target_os = "windows",
        target_os = "ios",
        target_os = "macos",
        target_os = "linux"
    ))
}
fn entry(source_key: &str) -> Result<keyring::Entry, String> {
    identifier(source_key)?;
    if !secure_platform() {
        return Err("Secure catalog credentials are not supported on this platform. Anonymous catalogs remain available.".into());
    }
    keyring::Entry::new("app.quire.reader.opds", source_key)
        .map_err(|_| "Secure catalog storage is unavailable.".into())
}
#[tauri::command]
pub fn opds_credentials(
    source_key: String,
    source_url: String,
    credentials: Option<Credentials>,
) -> Result<(), String> {
    identifier(&source_key)?;
    let source = catalog_url(&source_url)?;
    if credentials.is_none() && !secure_platform() {
        return Ok(());
    }
    let entry = entry(&source_key)?;
    match credentials {
        Some(credentials) => {
            if credentials.username.is_empty()
                || credentials.username.len() > 1024
                || credentials.username.contains(':')
                || credentials.username.chars().any(char::is_control)
                || credentials.password.is_empty()
                || credentials.password.len() > 8192
            {
                return Err("Enter a valid catalog username and password.".into());
            }
            let saved = serde_json::to_string(&SavedCredentials {
                origin: source.origin().ascii_serialization(),
                credentials,
            })
            .map_err(|_| "Invalid credentials.")?;
            entry
                .set_password(&saved)
                .map_err(|_| "Could not securely save catalog credentials.".into())
        }
        None => entry
            .delete_credential()
            .or_else(|e| {
                if matches!(e, keyring::Error::NoEntry) {
                    Ok(())
                } else {
                    Err(e)
                }
            })
            .map_err(|_| "Could not remove catalog credentials.".into()),
    }
}
fn credentials(source_key: &str, source: &Url) -> Result<Option<Credentials>, String> {
    identifier(source_key)?;
    if !secure_platform() {
        return Ok(None);
    }
    match entry(source_key)?.get_password() {
        Ok(value) => {
            let saved: SavedCredentials = serde_json::from_str(&value).map_err(|_| "Saved catalog credentials are invalid; enter them again.")?;
            Ok((saved.origin == source.origin().ascii_serialization()).then_some(saved.credentials))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Secure catalog credentials are unavailable. Unlock the system credential store and retry.".into()),
    }
}
enum RequestState {
    Active(watch::Sender<bool>),
    Cancelled(Instant),
}
static REQUESTS: OnceLock<Mutex<HashMap<String, RequestState>>> = OnceLock::new();
fn requests() -> &'static Mutex<HashMap<String, RequestState>> {
    REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn prune(requests: &mut HashMap<String, RequestState>) {
    requests.retain(|_, value| !matches!(value, RequestState::Cancelled(at) if at.elapsed() > Duration::from_secs(60)));
}
struct Registration(String);
impl Drop for Registration {
    fn drop(&mut self) {
        if let Ok(mut requests) = requests().lock() {
            requests.remove(&self.0);
        }
    }
}
fn register(id: &str) -> Result<(Registration, watch::Receiver<bool>), String> {
    identifier(id)?;
    let mut requests = requests()
        .lock()
        .map_err(|_| "Catalog requests unavailable.")?;
    prune(&mut requests);
    if matches!(requests.get(id), Some(RequestState::Cancelled(_))) {
        requests.remove(id);
        return Err("Catalog request cancelled.".into());
    }
    if requests.contains_key(id) {
        return Err("Catalog request is already active.".into());
    }
    if requests
        .values()
        .filter(|v| matches!(v, RequestState::Active(_)))
        .count()
        >= 32
    {
        return Err("Too many active catalog requests.".into());
    }
    let (sender, receiver) = watch::channel(false);
    requests.insert(id.into(), RequestState::Active(sender));
    Ok((Registration(id.into()), receiver))
}
#[tauri::command]
pub fn opds_cancel(request_id: String) -> Result<(), String> {
    identifier(&request_id)?;
    let mut requests = requests()
        .lock()
        .map_err(|_| "Catalog requests unavailable.")?;
    prune(&mut requests);
    if let Some(RequestState::Active(sender)) = requests.get(&request_id) {
        let _ = sender.send(true);
    } else {
        // Bounded tombstones handle cancellation arriving before fetch registration.
        if requests.len() >= 160 {
            let oldest = requests
                .iter()
                .filter_map(|(id, value)| {
                    if let RequestState::Cancelled(at) = value {
                        Some((id.clone(), *at))
                    } else {
                        None
                    }
                })
                .min_by_key(|(_, at)| *at);
            if let Some((id, _)) = oldest {
                requests.remove(&id);
            }
        }
        requests.insert(request_id, RequestState::Cancelled(Instant::now()));
    }
    Ok(())
}
fn bounded_size(size: u64, additional: u64, limit: u64) -> Result<u64, String> {
    size.checked_add(additional)
        .filter(|n| *n <= limit)
        .ok_or_else(|| "Catalog response exceeds the size limit.".into())
}
async fn fetch_response(
    source: &Url,
    mut url: Url,
    credentials: Option<Credentials>,
) -> Result<reqwest::Response, String> {
    if source.scheme() == "https" && url.scheme() != "https" {
        return Err("Catalog link would downgrade a secure connection.".into());
    }
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|_| "Catalog connection unavailable.")?;
    for redirects in 0..=5 {
        let mut request = client.get(url.clone()).header(
            "Accept",
            "application/opds+json, application/atom+xml, application/xml, application/json, */*",
        );
        if url.origin() == source.origin() {
            if let Some(credentials) = &credentials {
                request = request.basic_auth(&credentials.username, Some(&credentials.password));
            }
        }
        let response = request
            .send()
            .await
            .map_err(|_| "Could not connect to the catalog. Check the address and connection.")?;
        if response.status().is_redirection() {
            if redirects == 5 {
                return Err("Catalog redirected too many times.".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Catalog redirect has no valid destination.")?;
            url = redirect_url(&url, location)?;
            continue;
        }
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                401 | 403 => "The catalog requires valid credentials or permission.",
                404 => "This catalog item is no longer available.",
                429 => "The catalog is busy. Try again shortly.",
                _ => "The catalog could not complete this request.",
            }
            .into());
        }
        return Ok(response);
    }
    unreachable!()
}
#[tauri::command]
pub async fn opds_fetch(
    app: tauri::AppHandle,
    request_id: String,
    source_key: String,
    source_url: String,
    url: String,
    kind: String,
) -> Result<Value, String> {
    let source = catalog_url(&source_url)?;
    let url = catalog_url(&url)?;
    let limit = match kind.as_str() {
        "feed" => 4 * 1024 * 1024,
        "cover" => 8 * 1024 * 1024,
        "book" => 8 * 1024 * 1024 * 1024,
        _ => return Err("Invalid catalog response kind.".into()),
    };
    let (_registration, cancel) = register(&request_id)?;
    let credentials = credentials(&source_key, &source)?;
    let download = async {
        let mut response = fetch_response(&source, url, credentials).await?;
        let total = response.content_length();
        if let Some(size) = total {
            bounded_size(0, size, limit)?;
        }
        let url = response.url().to_string();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let name = response
            .url()
            .path_segments()
            .and_then(|segments| segments.last())
            .filter(|name| !name.is_empty())
            .unwrap_or("download")
            .to_string();
        let mut staged = if kind == "feed" {
            None
        } else {
            Some(crate::book_files::DownloadFile::new(&app)?)
        };
        let mut body = Vec::new();
        let mut size = 0;
        let mut last_progress = Instant::now();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Catalog download was interrupted.")?
        {
            size = bounded_size(size, chunk.len() as u64, limit)?;
            if let Some(staged) = &mut staged {
                staged.append(&chunk)?;
            } else {
                body.extend_from_slice(&chunk);
            }
            if last_progress.elapsed() >= Duration::from_millis(100) {
                let _ = app.emit(
                    "opds-progress",
                    json!({"requestId":request_id,"received":size,"total":total}),
                );
                last_progress = Instant::now();
            }
        }
        if total.is_some_and(|total| total != size) {
            return Err("Incomplete catalog download.".into());
        }
        if *cancel.borrow() {
            return Err("Catalog request cancelled.".into());
        }
        let _ = app.emit(
            "opds-progress",
            json!({"requestId":request_id,"received":size,"total":total}),
        );
        if let Some(staged) = staged {
            let reference = staged.finish()?;
            Ok(
                json!({"id":reference.trim_start_matches("@quire-file:"),"reference":reference,"name":name,"mediaType":content_type,"size":size,"url":url}),
            )
        } else {
            let body = String::from_utf8(body).map_err(|_| "Catalog feed is not valid UTF-8.")?;
            Ok(json!({"body":body,"contentType":content_type,"url":url}))
        }
    };
    let mut cancelled = cancel.clone();
    tokio::select! {
        biased;
        _ = async { if !*cancelled.borrow() { let _ = cancelled.changed().await; } } => Err("Catalog request cancelled.".into()),
        result = tokio::time::timeout(Duration::from_secs(if kind == "book" { 300 } else { 45 }), download) => result.map_err(|_| "Catalog request timed out.")?,
    }
}
fn account_route(path: &str, method: &str) -> Result<Method, String> {
    for base in ["/v1/catalog-sources", "/v1/opds/passwords"] {
        if path == base
            && (matches!(method, "GET" | "POST")
                || (base == "/v1/catalog-sources" && method == "PUT"))
        {
            return Method::from_bytes(method.as_bytes())
                .map_err(|_| "Invalid catalog method.".into());
        }
        if let Some(id) = path.strip_prefix(&format!("{base}/")) {
            if identifier(id).is_ok()
                && (method == "DELETE"
                    || (base == "/v1/catalog-sources" && matches!(method, "PUT" | "PATCH")))
            {
                return Method::from_bytes(method.as_bytes())
                    .map_err(|_| "Invalid catalog method.".into());
            }
        }
    }
    Err("Invalid catalog account endpoint.".into())
}
#[tauri::command]
pub async fn opds_account_call(
    server: String,
    username: String,
    path: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, String> {
    let method = account_route(&path, &method)?;
    crate::sync::catalog_request(&server, &username, &path, method, body).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_embedded_secrets_and_downgrades() {
        for value in [
            "file:///etc/passwd",
            "https://u:p@example.com",
            "https://u@example.com",
            "https://example.com/#secret",
        ] {
            assert!(catalog_url(value).is_err());
        }
        assert!(catalog_url("http://192.168.1.2/catalog").is_ok());
        assert!(redirect_url(
            &catalog_url("https://example.com/feed").unwrap(),
            "http://example.com/feed"
        )
        .is_err());
        assert!(redirect_url(&catalog_url("https://example.com/feed").unwrap(), "/next").is_ok());
    }
    #[test]
    fn bounds_transfers_before_writing() {
        assert_eq!(bounded_size(5, 5, 10).unwrap(), 10);
        assert!(bounded_size(5, 6, 10).is_err());
        assert!(bounded_size(u64::MAX, 1, 10).is_err());
    }
    #[test]
    fn account_routes_are_narrowly_scoped() {
        assert!(account_route("/v1/catalog-sources", "GET").is_ok());
        assert!(account_route("/v1/opds/passwords/abc123", "DELETE").is_ok());
        for path in [
            "/v1/sessions",
            "/v1/opds/passwords/../sessions",
            "/v1/catalog-sources?x=y",
            "/v1/catalog-sources/%2f",
        ] {
            assert!(account_route(path, "GET").is_err());
        }
        assert!(account_route("/v1/opds/passwords", "PUT").is_err());
    }
    #[test]
    fn cancellation_handles_early_abort_and_removes_active_registration() {
        opds_cancel("early-abort".into()).unwrap();
        assert!(register("early-abort").is_err());
        let (guard, receiver) = register("active-abort").unwrap();
        assert!(register("active-abort").is_err());
        opds_cancel("active-abort".into()).unwrap();
        assert!(*receiver.borrow());
        drop(guard);
        assert!(register("active-abort").is_ok());
    }
    #[test]
    fn cross_origin_redirects_do_not_receive_basic_credentials() {
        use std::io::{Read, Write};
        let target = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let source = catalog_url(&format!("http://{}/feed", origin.local_addr().unwrap())).unwrap();
        let location = format!("http://{}/next", target.local_addr().unwrap());
        let first = std::thread::spawn(move || {
            let (mut stream, _) = origin.accept().unwrap();
            let mut bytes = [0; 4096];
            let n = stream.read(&mut bytes).unwrap();
            assert!(String::from_utf8_lossy(&bytes[..n])
                .to_lowercase()
                .contains("authorization: basic dXNlcjpwYXNz".to_lowercase().as_str()));
            write!(stream, "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let second = std::thread::spawn(move || {
            let (mut stream, _) = target.accept().unwrap();
            let mut bytes = [0; 4096];
            let n = stream.read(&mut bytes).unwrap();
            assert!(!String::from_utf8_lossy(&bytes[..n])
                .to_lowercase()
                .contains("authorization:"));
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
            )
            .unwrap();
        });
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let response = fetch_response(
                    &source,
                    source.clone(),
                    Some(Credentials {
                        username: "user".into(),
                        password: "pass".into(),
                    }),
                )
                .await
                .unwrap();
                assert_eq!(response.text().await.unwrap(), "{}");
            });
        first.join().unwrap();
        second.join().unwrap();
    }
}
