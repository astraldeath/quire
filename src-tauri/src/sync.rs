use reqwest::{Client,Method,Url};
use serde_json::{json,Value};
use std::time::Duration;

fn origin(value:&str)->Result<String,String>{
 let u=Url::parse(value).map_err(|_|"Invalid server address.")?;
 let local=matches!(u.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"));
 if !(u.scheme()=="https"||(u.scheme()=="http"&&local))||!u.username().is_empty()||u.password().is_some()||u.query().is_some()||u.fragment().is_some()||u.path()!="/" {return Err("Use an HTTPS server origin without a path or credentials.".into())}
 Ok(u.origin().ascii_serialization())
}
fn credential(origin:&str,user:&str)->Result<keyring::Entry,String>{
 if !cfg!(any(target_os="windows",target_os="ios",target_os="macos",target_os="linux")){return Err("Secure sync credentials are not supported on this platform.".into())}
 keyring::Entry::new("app.quire.reader.sync",&format!("{}@{}",user,origin)).map_err(|_|"Credential storage is unavailable.".into())
}
async fn request(origin:&str,path:&str,method:Method,body:Option<Value>,token:Option<String>)->Result<Value,String>{
 let client=Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(30)).build().map_err(|_|"Could not initialize secure connection.")?;
 let mut req=client.request(method,format!("{}{}",origin,path));if let Some(body)=body {if body.to_string().len()>2*1024*1024{return Err("Sync request is too large.".into())}req=req.json(&body)};if let Some(token)=token{req=req.bearer_auth(token)}
 let mut response=req.send().await.map_err(|_|"Server unavailable. Your local changes are saved.".to_string())?;
 if !response.status().is_success(){if response.status().as_u16()==404 && path=="/v1/updates" {return Err("Update Quire Server to enable version checks.".into())}if response.status().as_u16()==404 && path=="/v1/privacy/sync" {return Err("Update Quire Server to sync private library settings.".into())}return Err(match response.status().as_u16(){401=>"Sign in again; this session expired or was revoked.",409=>"Sync conflict requires attention. Your local changes are saved.",429=>"Server is busy. Try again shortly.",_=>"The server could not complete this request."}.into())}
 if response.status().as_u16()==204{return Ok(Value::Null)}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Server response was interrupted.")?{if bytes.len()+chunk.len()>64*1024*1024{return Err("Server response is too large.".into())}bytes.extend_from_slice(&chunk)}
 serde_json::from_slice(&bytes).map_err(|_|"Invalid server response.".into())
}
#[tauri::command]
pub async fn sync_discover(server:String)->Result<Value,String>{let o=origin(&server)?;let value=request(&o,"/.well-known/quire",Method::GET,None,None).await?;if value["apiVersion"]!="1"||value["apiUrl"]!=format!("{o}/v1"){return Err("This server is not compatible with Quire.".into())}Ok(value)}
#[tauri::command]
pub async fn sync_login(server:String,username:String,password:String,device:String)->Result<Value,String>{
 let o=origin(&server)?;let entry=credential(&o,&username)?;
 let value=request(&o,"/v1/sessions",Method::POST,Some(json!({"username":username,"password":password,"deviceName":device})),None).await?;
 let token=value["token"].as_str().filter(|v|v.len()==64).ok_or("Invalid session response.")?;
 if entry.set_password(token).is_err(){if let Some(id)=value["session"]["id"].as_str(){let _=request(&o,&format!("/v1/sessions/{id}"),Method::DELETE,None,Some(token.into())).await;}return Err("Could not securely save the session. Sign-in was cancelled.".into())}
 Ok(value["session"].clone())
}
#[tauri::command]
pub async fn sync_call(server:String,username:String,body:Value)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;request(&o,"/v1/sync",Method::POST,Some(body),Some(token)).await}
#[tauri::command]
pub async fn statistics_call(server:String,username:String,body:Value)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;request(&o,"/v1/statistics/sync",Method::POST,Some(body),Some(token)).await}
#[tauri::command]
pub async fn privacy_call(server:String,username:String,body:Value)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;request(&o,"/v1/privacy/sync",Method::POST,Some(body),Some(token)).await}
#[tauri::command]
pub async fn sync_logout(server:String,username:String,session:String)->Result<(),String>{
 let o=origin(&server)?;if !session.bytes().all(|c|c.is_ascii_hexdigit())||session.len()!=64{return Err("Invalid session.".into())}let entry=credential(&o,&username)?;
 let result=if let Ok(token)=entry.get_password(){request(&o,&format!("/v1/sessions/{session}"),Method::DELETE,None,Some(token)).await.map(|_|())}else{Ok(())};
 entry.delete_credential().or_else(|e|if matches!(e,keyring::Error::NoEntry){Ok(())}else{Err(e)}).map_err(|_|"Could not remove saved credentials.")?;
 result.map_err(|_|"Signed out locally. The server was unavailable; revoke this session from another device or reset your password.".into())
}
#[cfg(test)]mod tests{use super::*;#[test]fn validates_server_origin(){assert!(origin("https://books.example").is_ok());assert!(origin("http://127.0.0.1:8080").is_ok());for u in ["http://books.example","https://x/y","https://user:pass@x","file:///etc/passwd"]{assert!(origin(u).is_err());}}}
#[tauri::command]
pub async fn sync_files(server:String,username:String,delete:Option<String>)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;match delete{Some(id)=>{check_book_id(&id)?;request(&o,&format!("/v1/books/{id}/file"),Method::DELETE,None,Some(token)).await},None=>request(&o,"/v1/files",Method::GET,None,Some(token)).await}}
fn check_book_id(id:&str)->Result<(),String>{if id.len()!=64||!id.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c)){Err("Invalid book identity.".into())}else{Ok(())}}
const LEGACY_LIMIT: u64 = 128 * 1024 * 1024;
const STORED_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
fn file_limits(value: &Value) -> Result<(u64, u64), String> {
    if let Some(capabilities) = value.get("capabilities") {
        if !capabilities.as_array().is_some_and(|values| values.iter().all(Value::is_string)) {
            return Err("Invalid server capabilities.".into());
        }
    }
    let Some(limits) = value.get("limits") else { return Ok((LEGACY_LIMIT, LEGACY_LIMIT)); };
    let limit = |key: &str| -> Result<u64, String> {
        limits[key].as_u64().filter(|v| *v > 0 && *v <= 9_007_199_254_740_991)
            .map(|v| v.min(STORED_LIMIT)).ok_or_else(|| "Invalid server file limits.".into())
    };
    Ok((limit("maxUploadBytes")?, limit("maxDownloadBytes")?))
}
fn checked_size(size: u64, additional: u64, limit: u64) -> Result<u64, String> {
    size.checked_add(additional).filter(|v| *v <= limit).ok_or_else(|| "Book file is too large.".into())
}
fn download_length(value: Option<&str>, limit: u64) -> Result<Option<u64>, String> {
    value.map(|v| {
        if v.is_empty() || !v.bytes().all(|c| c.is_ascii_digit()) { return Err("Invalid book size.".into()); }
        let size = v.parse::<u64>().map_err(|_| "Invalid book size.")?;
        checked_size(0, size, limit)
    }).transpose()
}
fn transfer_client() -> Result<Client, String> {
    Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(300)).build().map_err(|_| "Connection unavailable.".into())
}
#[tauri::command]
pub async fn sync_upload_file(app: tauri::AppHandle, server: String, username: String, book: String, reference: String) -> Result<(), String> {
    let o = origin(&server)?;
    check_book_id(&book)?;
    let limit = file_limits(&sync_discover(o.clone()).await?)?.0;
    let token = credential(&o, &username)?.get_password().map_err(|_| "Sign in to upload books.")?;
    // Resolve only opaque immutable book references, never a caller-supplied path.
    let file = tokio::fs::File::open(crate::book_files::file_path(&app, &reference)?).await.map_err(|_| "Book file is unavailable.")?;
    let size = file.metadata().await.map_err(|_| "Book file is unavailable.")?.len();
    checked_size(0, size, limit)?;
    let response = transfer_client()?.put(format!("{o}/v1/books/{book}/file")).bearer_auth(token)
        .header("Content-Type", "application/octet-stream").header("Content-Length", size)
        .body(file).send().await.map_err(|_| "Upload interrupted. Try again.")?;
    if !response.status().is_success() { return Err("Upload failed. Check your session and file size, then retry.".into()); }
    Ok(())
}
#[tauri::command]
pub async fn sync_download_file(app: tauri::AppHandle, server: String, username: String, book: String) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let o = origin(&server)?;
    check_book_id(&book)?;
    let limit = file_limits(&sync_discover(o.clone()).await?)?.1;
    let token = credential(&o, &username)?.get_password().map_err(|_| "Sign in to download books.")?;
    let mut response = transfer_client()?.get(format!("{o}/v1/books/{book}/file")).bearer_auth(token).send().await.map_err(|_| "Download interrupted. Try again.")?;
    if !response.status().is_success() { return Err("The server book file is unavailable.".into()); }
    let length = response.headers().get("Content-Length").map(|v| v.to_str().map_err(|_| "Invalid book size.")).transpose()?;
    let expected = download_length(length, limit)?;
    let mut staged = crate::book_files::DownloadFile::new(&app)?;
    let mut size = 0;
    let mut hash = Sha256::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Download interrupted.")? {
        size = checked_size(size, chunk.len() as u64, limit)?;
        hash.update(&chunk);
        staged.append(&chunk)?;
    }
    if expected.is_some_and(|expected| expected != size) { return Err("Incomplete downloaded book.".into()); }
    if format!("{:x}", hash.finalize()) != book { return Err("Downloaded book file does not match this book.".into()); }
    staged.finish()
}

#[tauri::command]
pub async fn sync_metadata(server:String,username:String,book:String)->Result<Value,String>{
 let o=origin(&server)?;check_book_id(&book)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to load covers.")?;
 request(&o,&format!("/v1/books/{book}/metadata"),Method::GET,None,Some(token)).await
}

#[tauri::command]
pub async fn updates_call(server:String,username:String)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;request(&o,"/v1/updates",Method::GET,None,Some(token)).await}
#[cfg(test)]
mod transfer_tests {
 use super::*;
 #[test]
 fn discovery_limits_are_conservative_and_bounded() {
  assert_eq!(file_limits(&json!({})).unwrap(), (134217728,134217728));
  assert_eq!(file_limits(&json!({"limits":{"maxUploadBytes":2147483648u64,"maxDownloadBytes":9000000000u64}})).unwrap(), (2147483648,8589934592));
  for value in [json!({"limits":null}),json!({"limits":{}}),json!({"limits":{"maxUploadBytes":-1,"maxDownloadBytes":1}}),json!({"limits":{"maxUploadBytes":1.5,"maxDownloadBytes":1}})] { assert!(file_limits(&value).is_err()); }
 }
 #[test]
 fn validates_length_before_storage_and_rejects_overflow() {
  assert!(checked_size(8,3,10).is_err());
  assert!(checked_size(u64::MAX,1,8_589_934_592).is_err());
  assert_eq!(checked_size(8,2,10).unwrap(),10);
  for value in ["-1","+1","1.5","18446744073709551616","11"] { assert!(download_length(Some(value),10).is_err()); }
  assert_eq!(download_length(Some("10"),10).unwrap(),Some(10));
 }
}
