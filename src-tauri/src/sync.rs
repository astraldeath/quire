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
 if !cfg!(any(target_os="windows",target_os="ios",target_os="macos")){return Err("Secure sync credentials are not supported on this platform.".into())}
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
#[tauri::command]
pub async fn sync_upload(request:tauri::ipc::Request<'_>)->Result<(),String>{
 let header=|key:&str|request.headers().get(key).and_then(|v|v.to_str().ok()).map(String::from).ok_or("Missing transfer details.");
 let o=origin(&header("x-quire-server")?)?;let username=header("x-quire-user")?;let id=header("x-quire-book")?;check_book_id(&id)?;
 let bytes=match request.body(){tauri::ipc::InvokeBody::Raw(bytes) if bytes.len()<=128*1024*1024=>bytes.clone(),_=>return Err("Invalid or oversized book file.".into())};
 let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to upload books.")?;
 let client=Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(300)).build().map_err(|_|"Connection unavailable.")?;
 let response=client.put(format!("{o}/v1/books/{id}/file")).bearer_auth(token).header("Content-Type","application/octet-stream").body(bytes).send().await.map_err(|_|"Upload interrupted. Try again.")?;
 if !response.status().is_success(){return Err("Upload failed. Check your session and file size, then retry.".into())}Ok(())
}
#[tauri::command]
pub async fn sync_download(server:String,username:String,book:String)->Result<tauri::ipc::Response,String>{
 let o=origin(&server)?;check_book_id(&book)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to download books.")?;
 let client=Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(300)).build().map_err(|_|"Connection unavailable.")?;
 let mut response=client.get(format!("{o}/v1/books/{book}/file")).bearer_auth(token).send().await.map_err(|_|"Download interrupted. Try again.")?;if !response.status().is_success(){return Err("The server book file is unavailable.".into())}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Download interrupted.")?{if bytes.len()+chunk.len()>128*1024*1024{return Err("book file is too large.".into())}bytes.extend_from_slice(&chunk)}Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn sync_metadata(server:String,username:String,book:String)->Result<Value,String>{
 let o=origin(&server)?;check_book_id(&book)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to load covers.")?;
 request(&o,&format!("/v1/books/{book}/metadata"),Method::GET,None,Some(token)).await
}

#[tauri::command]
pub async fn updates_call(server:String,username:String)->Result<Value,String>{let o=origin(&server)?;let token=credential(&o,&username)?.get_password().map_err(|_|"Sign in to connect this device.")?;request(&o,"/v1/updates",Method::GET,None,Some(token)).await}
