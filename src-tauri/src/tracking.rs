//! Public native OAuth client. Credentials never cross the webview boundary.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

const CLIENT_ID: &str = "DxIhaNaNpfOUmtUuLuBTKXJsxfbqhUXY";
const CALLBACK: &str = "app.quire.reader://oauth/mangabaka";
const ISSUER: &str = "https://mangabaka.org/auth";
const API: &str = "https://api.mangabaka.org";
const TOKEN_URL: &str = "https://mangabaka.org/auth/oauth2/token";
// One lock covers credential reads, callback consumption, refresh and disconnect.
static AUTH: Mutex<Option<String>> = Mutex::const_new(None);

#[derive(Serialize, Deserialize)]
struct Pending {
    state: String,
    verifier: String,
    expires_at: u64,
}
#[derive(Serialize, Deserialize)]
struct Session {
    access_token: String,
    refresh_token: String,
    expires_at: u64,
    name: String,
    account_id: String,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn credential(slot: &str) -> Result<keyring::Entry, String> {
    if !cfg!(any(
        target_os = "windows",
        target_os = "ios",
        target_os = "macos"
    )) {
        return Err("Secure tracking credentials are unavailable on this platform.".into());
    }
    keyring::Entry::new("app.quire.reader.mangabaka", slot)
        .map_err(|_| "Secure credential storage is unavailable.".into())
}
fn read<T: serde::de::DeserializeOwned>(slot: &str) -> Result<Option<T>, String> {
    match credential(slot)?.get_password() {
        Ok(value) => serde_json::from_str(&value).map(Some).map_err(|_| {
            "Saved tracking credentials are invalid. Disconnect and reconnect.".into()
        }),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read secure tracking credentials.".into()),
    }
}
fn save<T: Serialize>(slot: &str, value: &T) -> Result<(), String> {
    let data =
        serde_json::to_string(value).map_err(|_| "Could not encode tracking credentials.")?;
    credential(slot)?
        .set_password(&data)
        .map_err(|_| "Could not securely save tracking credentials.".into())
}
fn remove(slot: &str) -> Result<(), String> {
    match credential(slot)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove secure tracking credentials.".into()),
    }
}
fn random() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Secure randomness is unavailable.")?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
fn client() -> Result<Client, String> {
    Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize secure tracking connection.".into())
}
async fn response(mut response: reqwest::Response) -> Result<(u16, Value), String> {
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "MangaBaka response was interrupted.")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("MangaBaka response is too large.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Ok((status, Value::Null));
    }
    Ok((
        status,
        serde_json::from_slice(&bytes).map_err(|_| "MangaBaka returned an invalid response.")?,
    ))
}
fn provider_route(path: &str, method: &str) -> Result<(Method, bool), String> {
    let verb = match method {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        _ => return Err("Unsupported tracking request.".into()),
    };
    if path.len() > 2048 {
        return Err("Tracking request is too long.".into());
    }
    if let Some(query) = path.strip_prefix("/v1/series/search?") {
        let pairs: Vec<_> = Url::parse(&format!("{API}{path}"))
            .map_err(|_| "Invalid search.")?
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        if method == "GET"
            && query.starts_with("q=")
            && !path.contains('#')
            && pairs.len() == 1
            && pairs[0].0 == "q"
            && !pairs[0].1.trim().is_empty()
            && pairs[0].1.len() <= 512
        {
            return Ok((verb, false));
        }
    }
    for (prefix, authenticated) in [("/v1/series/", false), ("/v1/my/library/", true)] {
        if let Some(id) = path.strip_prefix(prefix) {
            if !id.is_empty()
                && id.len() <= 20
                && id.bytes().all(|c| c.is_ascii_digit())
                && (authenticated || method == "GET")
            {
                return Ok((verb, authenticated));
            }
        }
    }
    Err("Unsupported tracking request.".into())
}
fn callback_code(raw: &str, pending: &Pending, time: u64) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid MangaBaka callback.")?;
    let mut target = url.clone();
    target.set_query(None);
    if raw.split('?').next() != Some(CALLBACK)
        || target.as_str() != CALLBACK
        || url.fragment().is_some()
        || raw.len() > 8192
    {
        return Err("Invalid MangaBaka callback target.".into());
    }
    if pending.expires_at <= time {
        return Err("MangaBaka sign-in expired. Connect again.".into());
    }
    let mut values = std::collections::HashMap::new();
    for (key, value) in url.query_pairs() {
        if values
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err("Invalid duplicate OAuth parameters.".into());
        }
    }
    if values.get("state") != Some(&pending.state) {
        return Err("MangaBaka sign-in state did not match.".into());
    }
    if values.get("iss").is_some_and(|issuer| issuer != ISSUER) {
        return Err("Unexpected MangaBaka sign-in issuer.".into());
    }
    if values.contains_key("error") {
        return Err("MangaBaka sign-in was declined. Connect again to retry.".into());
    }
    values
        .remove("code")
        .filter(|code| !code.is_empty() && code.len() <= 4096)
        .ok_or("MangaBaka callback has no authorization code.".into())
}
async fn token(form: &[(&str, &str)]) -> Result<Value, String> {
    let (status, data) = response(
        client()?
            .post(TOKEN_URL)
            .form(form)
            .send()
            .await
            .map_err(|_| "MangaBaka sign-in could not connect.")?,
    )
    .await?;
    if status != 200 {
        return Err("MangaBaka authorization expired or was rejected. Connect again.".into());
    }
    if data["token_type"]
        .as_str()
        .is_none_or(|v| !v.eq_ignore_ascii_case("bearer"))
    {
        return Err("Unsupported MangaBaka token type.".into());
    }
    check_token_scope(&data)?;
    Ok(data)
}
fn check_token_scope(data: &Value) -> Result<(), String> {
    // OAuth permits omission when the granted scope is identical to the request.
    if let Some(value) = data.get("scope") {
        let scopes = value
            .as_str()
            .ok_or("Invalid MangaBaka permission response.")?
            .split_whitespace()
            .collect::<Vec<_>>();
        if !["profile", "library.read", "library.write"]
            .iter()
            .all(|required| scopes.contains(required))
        {
            return Err("MangaBaka library permissions were not granted. Connect again.".into());
        }
    }
    Ok(())
}
fn provider_result(status: u16, data: Value) -> Value {
    let data = data.get("data").cloned().unwrap_or(data);
    json!({"status":status,"data":data})
}
fn token_string(data: &Value, key: &str) -> Result<String, String> {
    data[key]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 16384)
        .map(str::to_owned)
        .ok_or("Invalid MangaBaka token response.".into())
}
fn expiry(data: &Value) -> Result<u64, String> {
    let seconds = data["expires_in"]
        .as_u64()
        .filter(|v| *v > 0 && *v <= 366 * 86400)
        .ok_or("Invalid MangaBaka token expiry.")?;
    Ok(now().saturating_add(seconds))
}
async fn access(session: &mut Session, force: bool) -> Result<(), String> {
    if !force && session.expires_at > now() + 60 {
        return Ok(());
    }
    let data = token(&[
        ("grant_type", "refresh_token"),
        ("client_id", CLIENT_ID),
        ("refresh_token", &session.refresh_token),
    ])
    .await?;
    session.access_token = token_string(&data, "access_token")?;
    if data.get("refresh_token").is_some() {
        session.refresh_token = token_string(&data, "refresh_token")?;
    }
    session.expires_at = expiry(&data)?;
    save("session", session)
}
async fn complete_callback(raw: &str) -> Result<(), String> {
    let Some(pending) = read::<Pending>("pending")? else {
        return Ok(());
    };
    // Consume even an invalid callback: no state/code can ever be redeemed twice.
    remove("pending")?;
    let code = callback_code(raw, &pending, now())?;
    let data = token(&[
        ("grant_type", "authorization_code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", CALLBACK),
        ("code", &code),
        ("code_verifier", &pending.verifier),
    ])
    .await?;
    let access_token = token_string(&data, "access_token")?;
    let (status, profile) = response(
        client()?
            .get(format!("{API}/v1/my/profile"))
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|_| "Could not load MangaBaka profile.")?,
    )
    .await?;
    if status != 200 {
        return Err("Could not verify MangaBaka account.".into());
    }
    let (account_id, name) = profile_identity(&profile)?;
    save(
        "session",
        &Session {
            access_token,
            refresh_token: token_string(&data, "refresh_token")?,
            expires_at: expiry(&data)?,
            account_id,
            name,
        },
    )
}
fn profile_identity(profile: &Value) -> Result<(String, String), String> {
    let profile = &profile["data"];
    let scopes = profile["scopes"]
        .as_array()
        .ok_or("MangaBaka profile has no granted permissions.")?;
    if !["profile", "library.read", "library.write"]
        .iter()
        .all(|required| scopes.iter().any(|scope| scope.as_str() == Some(required)))
    {
        return Err("MangaBaka library permissions were not granted. Connect again.".into());
    }
    let id = profile["id"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 256)
        .ok_or("MangaBaka profile has no account identity.")?
        .to_owned();
    let name = profile["nickname"]
        .as_str()
        .filter(|v| !v.is_empty())
        .or_else(|| profile["preferred_username"].as_str())
        .unwrap_or("MangaBaka")
        .to_owned();
    Ok((id, name))
}
fn check_account(expected: Option<&str>, actual: &str) -> Result<(), String> {
    if expected != Some(actual) {
        return Err("MangaBaka account changed. Reopen tracking before continuing.".into());
    }
    Ok(())
}
fn check_body(method: &Method, body: &Option<Value>) -> Result<(), String> {
    if body.as_ref().is_some_and(|v| v.to_string().len() > 65536)
        || (*method == Method::GET && body.is_some())
    {
        return Err("Invalid tracking request body.".into());
    }
    Ok(())
}
pub fn receive(url: Url) {
    // Ignore unrelated links without consuming a pending authorization.
    if url.scheme() != "app.quire.reader" || url.host_str() != Some("oauth") {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut error = AUTH.lock().await;
        match complete_callback(url.as_str()).await {
            Ok(()) => *error = None,
            Err(message) => *error = Some(message),
        }
    });
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.deep_link().on_open_url(|event| {
        for url in event.urls() {
            receive(url);
        }
    });
    if let Some(urls) = app.deep_link().get_current()? {
        for url in urls {
            receive(url);
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn tracking_status() -> Result<Value, String> {
    let mut error = AUTH.lock().await;
    let mut pending = read::<Pending>("pending")?;
    if pending
        .as_ref()
        .is_some_and(|pending| pending.expires_at <= now())
    {
        remove("pending")?;
        pending = None;
        *error = Some("MangaBaka sign-in expired. Connect again.".into());
    }
    let session = read::<Session>("session")?;
    Ok(match session {
        Some(s) => {
            json!({"connected":true,"name":s.name,"accountId":s.account_id,"error":*error,"pending":pending.is_some()})
        }
        None => {
            json!({"connected":false,"name":"","accountId":"","error":*error,"pending":pending.is_some()})
        }
    })
}
#[tauri::command]
pub async fn tracking_connect(app: tauri::AppHandle) -> Result<(), String> {
    let mut error = AUTH.lock().await;
    *error = None;
    let pending = Pending {
        state: random()?,
        verifier: random()?,
        expires_at: now() + 600,
    };
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(pending.verifier.as_bytes()));
    let mut url = Url::parse("https://mangabaka.org/auth/oauth2/authorize")
        .map_err(|_| "Invalid authorization address.")?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", CLIENT_ID),
        ("response_type", "code"),
        ("redirect_uri", CALLBACK),
        ("scope", "library.read library.write profile offline_access"),
        ("state", pending.state.as_str()),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
    ]);
    save("pending", &pending)?;
    if app.opener().open_url(url.as_str(), None::<&str>).is_err() {
        remove("pending")?;
        return Err("Could not open the browser for MangaBaka sign-in.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn tracking_disconnect() -> Result<(), String> {
    let mut error = AUTH.lock().await;
    remove("pending")?;
    remove("session")?;
    *error = None;
    Ok(())
}
#[tauri::command]
pub async fn tracking_provider(
    path: String,
    method: String,
    body: Option<Value>,
    expected_account_id: Option<String>,
) -> Result<Value, String> {
    let (method, authenticated) = provider_route(&path, &method)?;
    check_body(&method, &body)?;
    let request = |token: Option<&str>| {
        let mut request = client()?.request(method.clone(), format!("{API}{path}"));
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = &body {
            request = request.json(body);
        }
        Ok::<_, String>(request)
    };
    let result = if authenticated {
        let _guard = AUTH.lock().await;
        let mut session =
            read::<Session>("session")?.ok_or("Connect MangaBaka to update your library.")?;
        check_account(expected_account_id.as_deref(), &session.account_id)?;
        access(&mut session, false).await?;
        let mut result = response(
            request(Some(&session.access_token))?
                .send()
                .await
                .map_err(|_| "MangaBaka is unavailable. Try again shortly.")?,
        )
        .await?;
        if result.0 == 401 {
            access(&mut session, true).await?;
            result = response(
                request(Some(&session.access_token))?
                    .send()
                    .await
                    .map_err(|_| "MangaBaka is unavailable. Try again shortly.")?,
            )
            .await?;
        }
        result
    } else {
        response(
            request(None)?
                .send()
                .await
                .map_err(|_| "MangaBaka is unavailable. Try again shortly.")?,
        )
        .await?
    };
    Ok(provider_result(result.0, result.1))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_unwraps_success_envelope_and_preserves_error_status() {
        assert_eq!(
            provider_result(200, json!({"status":200,"data":{"state":"reading"}})),
            json!({"status":200,"data":{"state":"reading"}})
        );
        assert_eq!(
            provider_result(404, json!({"status":404,"message":"Not Found"}))["status"],
            404
        );
    }
    #[test]
    fn token_scope_rejects_reduced_permission_grant() {
        assert!(check_token_scope(&json!({})).is_ok());
        assert!(check_token_scope(
            &json!({"scope":"profile library.read library.write offline_access"})
        )
        .is_ok());
        assert!(check_token_scope(&json!({"scope":"profile library.read"})).is_err());
    }
    #[test]
    fn profile_requires_library_scopes_and_uses_provider_display_name() {
        let mut profile = json!({"data":{"id":"account-1","nickname":"Reader","preferred_username":"reader1","scopes":["profile","library.read","library.write"]}});
        assert_eq!(
            profile_identity(&profile).unwrap(),
            ("account-1".into(), "Reader".into())
        );
        profile["data"]["scopes"] = json!(["profile", "library.read"]);
        assert!(profile_identity(&profile).is_err());
    }
    #[test]
    fn account_binding_rejects_missing_and_stale_identity() {
        assert!(check_account(Some("a"), "a").is_ok());
        assert!(check_account(None, "a").is_err());
        assert!(check_account(Some("b"), "a").is_err());
    }
    #[test]
    fn request_body_rejects_get_payload_and_large_write() {
        assert!(check_body(&Method::GET, &Some(json!({}))).is_err());
        assert!(check_body(&Method::PUT, &Some(json!({"x":"x".repeat(65536)}))).is_err());
        assert!(check_body(&Method::PUT, &Some(json!({"progress_volume":2}))).is_ok());
    }
    #[test]
    fn provider_allowlist_rejects_url_and_path_escapes() {
        assert!(provider_route("/v1/series/search?q=One%20Piece", "GET").is_ok());
        assert!(provider_route("/v1/my/library/123", "PUT").unwrap().1);
        for path in [
            "https://evil.test",
            "//evil.test",
            "/v1/series/../my/profile",
            "/v1/series/%31",
            "/v1/my/library/1?x=y",
            "/v1/series/search?q=x&url=y",
        ] {
            assert!(provider_route(path, "GET").is_err(), "{path}");
        }
        assert!(provider_route("/v1/series/1", "POST").is_err());
    }
    #[test]
    fn callback_requires_exact_target_state_and_live_pending() {
        let pending = Pending {
            state: "correct".into(),
            verifier: "v".into(),
            expires_at: 200,
        };
        assert_eq!(
            callback_code(
                "app.quire.reader://oauth/mangabaka?state=correct&code=ok",
                &pending,
                100
            )
            .unwrap(),
            "ok"
        );
        for url in [
            "app.quire.reader://oauth/other?state=correct&code=ok",
            "app.quire.reader://evil/mangabaka?state=correct&code=ok",
            "app.quire.reader://oauth/mangabaka?state=wrong&code=ok",
            "app.quire.reader://oauth/mangabaka?state=correct&code=a&code=b",
            "app.quire.reader://oauth/mangabaka?state=correct&code=a&iss=https%3A%2F%2Fevil.test",
            "app.quire.reader://oauth/mangabaka?state=correct&error=denied",
        ] {
            assert!(callback_code(url, &pending, 100).is_err(), "{url}");
        }
        assert!(callback_code(
            "app.quire.reader://oauth/mangabaka?state=correct&code=ok",
            &pending,
            200
        )
        .is_err());
        for url in [
            "app.quire.reader://oauth/mangabaka?state=correct&state=correct&code=ok",
            "app.quire.reader://oauth:42/mangabaka?state=correct&code=ok",
            "app.quire.reader://user@oauth/mangabaka?state=correct&code=ok",
            "app.quire.reader://oauth/mangabaka?state=correct&code=ok#fragment",
            "app.quire.reader://oauth/foo/../mangabaka?state=correct&code=ok",
        ] {
            assert!(callback_code(url, &pending, 100).is_err());
        }
        assert!(callback_code("app.quire.reader://oauth/mangabaka?state=correct&code=ok&iss=https%3A%2F%2Fmangabaka.org%2Fauth", &pending, 100).is_ok());
    }
}
