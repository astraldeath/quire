import {useEffect,useState} from 'react';
import {CloudUpload,CloudDownload,Trash2} from 'lucide-react';
import type {Book} from '../../domain/models';
import {getFile,loadSync,putBook} from '../../storage';
import {importEpub} from '../../epub';
import {syncNow} from './engine';
import {files,upload,download,deleteUpload,type ServerFile} from './transport';
import type {Account} from './model';
export function BookServerActions({book}:{book:Book}){
 const [account,setAccount]=useState<Account>();const [remote,setRemote]=useState<ServerFile>();const [busy,setBusy]=useState('');const [error,setError]=useState('');const [confirm,setConfirm]=useState(false);
 useEffect(()=>{void loadSync().then(async s=>{if(s.enabled&&s.account){setAccount(s.account);setRemote((await files(s.account)).find(f=>f.bookId===book.id));}}).catch(e=>setError(String(e)));},[book.id]);
 if(!account)return null;
 const run=async(label:string,fn:()=>Promise<void>)=>{setBusy(label);setError('');try{await fn();setRemote((await files(account)).find(f=>f.bookId===book.id));window.dispatchEvent(new Event('quire-synced'));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy('');}};
 return <section className="book-server-actions"><h3>Server copy</h3><p className="muted">{remote?.watched?'Available from a read-only watched folder':remote?.uploaded?'Uploaded to your server':'No EPUB on your server'}</p><div className="server-actions">
 {book.local&&!remote?.uploaded&&<button type="button" className="text-action" disabled={!!busy} onClick={()=>void run('Uploading',async()=>{const bytes=await getFile(book.id);if(!bytes)throw new Error('Local EPUB is unavailable.');await syncNow();await upload(account,book.id,bytes);})}><CloudUpload/>Upload EPUB</button>}
 {!book.local&&remote&&<button type="button" className="text-action" disabled={!!busy} onClick={()=>void run('Downloading',async()=>{const bytes=await download(account,book.id);const result=await importEpub(new File([bytes.slice().buffer],'book.epub',{type:'application/epub+zip'}));if(result.book.id!==book.id)throw new Error('Downloaded EPUB does not match this book.');await putBook(result.book,result.bytes);})}><CloudDownload/>Download EPUB</button>}
 {remote?.uploaded&&!confirm&&<button type="button" className="text-action danger" disabled={!!busy} onClick={()=>setConfirm(true)}><Trash2/>Remove server upload</button>}
 </div>{confirm&&<div className="removal"><p>Remove the uploaded EPUB from your server? Existing downloads, notes, and reading progress stay saved.{remote?.watched?' The watched-folder copy will remain available.':''}</p><div className="button-row"><button type="button" disabled={!!busy} onClick={()=>setConfirm(false)}>Keep upload</button><button type="button" className="danger" disabled={!!busy} onClick={()=>void run('Removing upload',async()=>{await deleteUpload(account,book.id);setConfirm(false);})}>Remove upload</button></div></div>}{busy&&<p role="status">{busy}…</p>}{error&&<p role="alert">{error}</p>}</section>;
}
