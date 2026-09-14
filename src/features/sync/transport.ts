import {invoke,isTauri} from '@tauri-apps/api/core';
import type {Account,SyncResponse} from './model';
const tokens=new Map<string,string>();
export function serverOrigin(raw:string):string{
 const u=new URL(raw);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Use an HTTPS server address without a path.');return u.origin;
}
async function web(origin:string,path:string,body?:unknown,token?:string,method=body?'POST':'GET'){
 const response=await fetch(origin+path,{method,redirect:'error',credentials:'omit',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===401?'Sign in again; this session expired or was revoked.':response.status===409?'Sync conflict requires attention. Local changes are saved.':response.status===429?'Server is busy. Try again shortly.':'The server could not complete this request.');
 if(response.status===204)return null;
 const reader=response.body?.getReader();if(!reader)throw new Error('Empty server response.');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64*1024*1024){await reader.cancel();throw new Error('Server response is too large.');}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function discover(origin:string){origin=serverOrigin(origin);const v=isTauri()?await invoke<any>('sync_discover',{server:origin}):await web(origin,'/.well-known/quire');if(v?.apiVersion!=='1'||v?.apiUrl!==origin+'/v1'||typeof v?.name!=='string')throw new Error('This server is not compatible with Quire.');return {name:v.name.slice(0,100),origin};}
export async function login(origin:string,username:string,password:string){
 if(isTauri())return await invoke<{id:string}>('sync_login',{server:origin,username,password,device:/iPhone|iPad/.test(navigator.userAgent)?'Quire iOS':'Quire desktop'});
 const v=await web(origin,'/v1/sessions',{username,password,deviceName:'Quire browser'});if(typeof v?.token!=='string'||!v?.session?.id)throw new Error('Invalid session response.');tokens.set(`${username}@${origin}`,v.token);return v.session as {id:string};
}
export async function logout(a:Account){if(isTauri())return invoke<void>('sync_logout',{server:a.origin,username:a.username,session:a.sessionId});const key=`${a.username}@${a.origin}`,token=tokens.get(key);tokens.delete(key);if(token)await web(a.origin,`/v1/sessions/${encodeURIComponent(a.sessionId)}`,undefined,token,'DELETE');}
export async function call(a:Account,body:unknown):Promise<SyncResponse>{
 if(isTauri())return await invoke<SyncResponse>('sync_call',{server:a.origin,username:a.username,body});const token=tokens.get(`${a.username}@${a.origin}`);if(!token)throw new Error('Sign in again. Browser sessions last until this tab closes.');return web(a.origin,'/v1/sync',body,token);
}
export interface ServerFile {bookId:string;size:number;uploaded:boolean;watched:boolean}
function webToken(a:Account){const token=tokens.get(`${a.username}@${a.origin}`);if(!token)throw new Error('Sign in again.');return token;}
export async function files(a:Account):Promise<ServerFile[]>{const v=isTauri()?await invoke<any>('sync_files',{server:a.origin,username:a.username,delete:null}):await web(a.origin,'/v1/files',undefined,webToken(a));if(!Array.isArray(v?.files)||v.files.some((f:any)=>!(/^[a-f0-9]{64}$/).test(f.bookId)||typeof f.uploaded!=='boolean'||typeof f.watched!=='boolean'||!Number.isSafeInteger(f.size)||f.size<0))throw new Error('Invalid server file list.');return v.files;}
export async function deleteUpload(a:Account,book:string){if(isTauri())return invoke('sync_files',{server:a.origin,username:a.username,delete:book});return web(a.origin,`/v1/books/${book}/file`,undefined,webToken(a),'DELETE');}
export async function upload(a:Account,book:string,bytes:Uint8Array){
 if(bytes.length>128*1024*1024)throw new Error('The server accepts EPUBs up to 128 MB.');
 if(isTauri())return invoke('sync_upload',bytes,{headers:{'x-quire-server':a.origin,'x-quire-user':a.username,'x-quire-book':book}});
 const r=await fetch(`${a.origin}/v1/books/${book}/file`,{method:'PUT',redirect:'error',credentials:'omit',headers:{Authorization:`Bearer ${webToken(a)}`,'Content-Type':'application/epub+zip'},body:bytes.slice().buffer,signal:AbortSignal.timeout(300000)});if(!r.ok)throw new Error('Upload failed. Your local book is unchanged.');
}
export async function download(a:Account,book:string):Promise<Uint8Array>{
 if(isTauri())return new Uint8Array(await invoke<ArrayBuffer>('sync_download',{server:a.origin,username:a.username,book}));
 const r=await fetch(`${a.origin}/v1/books/${book}/file`,{redirect:'error',credentials:'omit',headers:{Authorization:`Bearer ${webToken(a)}`},signal:AbortSignal.timeout(300000)});if(!r.ok||!r.body)throw new Error('The server EPUB is unavailable.');const reader=r.body.getReader();let size=0;const parts:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024*1024){await reader.cancel();throw new Error('EPUB is too large.');}parts.push(value);}const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;
}

export async function metadata(a:Account,book:string):Promise<{cover:string}>{
 const v=isTauri()?await invoke<any>('sync_metadata',{server:a.origin,username:a.username,book}):await web(a.origin,`/v1/books/${book}/metadata`,undefined,webToken(a));
 if(typeof v?.cover!=='string'||v.cover.length>1024*1024||(v.cover!==''&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.cover)))throw new Error('Invalid server cover.');
 return {cover:v.cover};
}

export async function accountRequest(a:Account,path:string,body?:unknown,method?:string){return web(a.origin,path,body,webToken(a),method);}

export async function uploadShared(a:Account,library:string,id:string,bytes:ArrayBuffer){const r=await fetch(`${a.origin}/v1/admin/libraries/${library}/books/${id}`,{method:'PUT',headers:{Authorization:`Bearer ${webToken(a)}`,'Content-Type':'application/epub+zip'},body:bytes,signal:AbortSignal.timeout(300000)});if(!r.ok)throw new Error('Could not upload the shared book.');}
