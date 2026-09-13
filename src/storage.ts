import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { openDB, type DBSchema } from 'idb';
import { defaults, type Annotation, type Position, type Book, type Preferences } from './domain/models';
import {emptySync,queueChanges,type SyncState} from './features/sync/model';
interface Record {id:string;metadata:Book;file?:Uint8Array}
interface LibraryDB extends DBSchema {books:{key:string;value:Record};preferences:{key:string;value:Preferences|SyncState}}
const browser=()=>openDB<LibraryDB>('quire-library',1,{upgrade(db){db.createObjectStore('books',{keyPath:'id'});db.createObjectStore('preferences');}});
let browserPromise:ReturnType<typeof browser>|undefined;const idb=()=>browserPromise??=browser();
let nativePromise:Promise<Database>|undefined;const sql=()=>nativePromise??=Database.load('sqlite:quire.db');
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(fn:()=>Promise<T>):Promise<T>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}
function encode(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
const mergePreferences=(p?:Partial<Preferences>):Preferences=>({...defaults,...p,reader:{...defaults.reader,...p?.reader,theme:(p?.reader?.theme as string)==='sepia'?'app':p?.reader?.theme??defaults.reader.theme}});
export async function listBooks():Promise<Book[]>{
 if(isTauri()){const rows=await(await sql()).select<{metadata:string;local:number}[]>('SELECT metadata, file IS NOT NULL AS local FROM books');return rows.map(r=>({...JSON.parse(r.metadata),local:Boolean(r.local)}));}
 return(await(await idb()).getAll('books')).map(r=>({...r.metadata,local:r.file!==undefined}));
}
export async function loadSync():Promise<SyncState>{
 if(isTauri()){const rows=await(await sql()).select<{value:string}[]>('SELECT value FROM sync_state WHERE id = 1');return rows[0]?JSON.parse(rows[0].value):emptySync();}
 return(await(await idb()).get('preferences','sync') as SyncState|undefined)??emptySync();
}
interface Write {book:Book;fileMode:'keep'|'set'|'remove';file?:Uint8Array}
async function commit(sync:SyncState,writes:Write[]=[],deleted:string[]=[]){
 if(isTauri()){
  await(await sql()).execute('INSERT INTO sync_commits (payload) VALUES ($1)',[JSON.stringify({sync,writes:writes.map(w=>({...w,file:w.file?encode(w.file):undefined})),deleted})]);
 }else{
  const tx=(await idb()).transaction(['books','preferences'],'readwrite');
  try{for(const id of deleted)await tx.objectStore('books').delete(id);for(const w of writes){const old=await tx.objectStore('books').get(w.book.id);await tx.objectStore('books').put({id:w.book.id,metadata:w.book,file:w.fileMode==='set'?w.file:w.fileMode==='keep'?old?.file:undefined});}await tx.objectStore('preferences').put(sync,'sync');await tx.done;}
  catch(e){try{tx.abort();}catch{/* transaction already aborted */}await tx.done.catch(()=>{});throw e;}
 }
 if(typeof window!=='undefined')window.dispatchEvent(new Event('quire-storage'));
}
/** The library edit and its sync outbox are one SQLite statement/IDB transaction. */
async function edit(fn:(books:Book[])=>{writes:Write[];deleted?:string[]}){
 return serial(async()=>{const books=await listBooks(),sync=await loadSync();const {writes,deleted=[]}=fn(books);for(const w of writes)queueChanges(sync,books.find(b=>b.id===w.book.id),w.book);for(const id of deleted)queueChanges(sync,books.find(b=>b.id===id),undefined);await commit(sync,writes,deleted);});
}
export const saveBook=(book:Book)=>edit(()=>({writes:[{book,fileMode:'keep'}]}));
export const putBook=(book:Book,bytes:Uint8Array)=>edit(books=>({writes:[{book:(()=>{const old=books.find(b=>b.id===book.id);return old?{...old,cover:old.cover||book.cover}:book;})(),fileMode:'set',file:bytes}]}));
export const removeFile=(id:string)=>edit(books=>({writes:books.filter(b=>b.id===id).map(book=>({book,fileMode:'remove' as const}))}));
export const deleteBooks=(ids:string[])=>edit(()=>({writes:[],deleted:ids}));
export const restoreBooks=(records:{book:Book;file?:Uint8Array}[])=>edit(books=>({writes:records.map(({book,file})=>({book,fileMode:file&&!books.find(b=>b.id===book.id)?.local?'set':'keep',file}))}));
async function saveReadingField(id:string,field:'position'|'annotations',value:Position|Annotation[]){return edit(books=>{const book=books.find(b=>b.id===id);if(!book)throw new Error('Book is unavailable.');return {writes:[{book:{...book,[field]:value},fileMode:'keep'}]};});}
export const saveReadingPosition=(id:string,position:Position)=>saveReadingField(id,'position',position);
export const saveBookAnnotations=(id:string,annotations:Annotation[])=>saveReadingField(id,'annotations',annotations);
export async function getFile(id:string):Promise<Uint8Array|undefined>{
 if(isTauri()){const rows=await(await sql()).select<{file:string|null}[]>('SELECT file FROM books WHERE id = $1',[id]);return rows[0]?.file==null?undefined:Uint8Array.from(atob(rows[0].file),c=>c.charCodeAt(0));}
 return(await(await idb()).get('books',id))?.file;
}
export async function loadPreferences():Promise<Preferences>{
 if(isTauri()){const rows=await(await sql()).select<{value:string}[]>('SELECT value FROM preferences WHERE id = 1');return mergePreferences(rows[0]?JSON.parse(rows[0].value):undefined);}
 return mergePreferences(await(await idb()).get('preferences','device') as Preferences|undefined);
}
export async function savePreferences(p:Preferences):Promise<void>{
 if(isTauri()){await(await sql()).execute('INSERT INTO preferences (id, value) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET value = excluded.value',[JSON.stringify(p)]);return;}
 await(await idb()).put('preferences',p,'device');
}
/** Remote changes, acknowledgements and the pull cursor commit together. */
export function syncTransaction<T>(fn:(sync:SyncState,books:Book[])=>{result:T;books?:Book[]}):Promise<T>{
 return serial(async()=>{const sync=await loadSync(),books=await listBooks();const out=fn(sync,books);const writes=(out.books??[]).filter(book=>JSON.stringify(book)!==JSON.stringify(books.find(b=>b.id===book.id))).map(book=>({book,fileMode:'keep' as const}));await commit(sync,writes);return out.result;});
}
