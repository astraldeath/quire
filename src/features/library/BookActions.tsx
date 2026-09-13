import {useState} from 'react';
import {BookOpen,Info,Trash2,HardDriveDownload,FolderOpen} from 'lucide-react';
import {Modal} from '../../components/Modal';
import type {LibraryEntry} from '../../domain/library';
export function BookActions({entry,initialRemove=false,onClose,onOpen,onDetails,onRemoveDownload,onDelete}:{entry:LibraryEntry;initialRemove?:boolean;onClose():void;onOpen():void;onDetails():void;onRemoveDownload():Promise<void>;onDelete():Promise<void>}){
 const [confirm,setConfirm]=useState<'library'|'download'|null>(initialRemove?'library':null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();onClose();}catch(e){setError(e instanceof Error?e.message:'Could not remove the book. Please try again.');}finally{setBusy(false);}};
 return <Modal title={confirm?'Confirm removal':entry.series?'Series actions':'Book actions'} onClose={()=>{if(!busy)onClose();}}><div className="book-actions">
 <div className="book-action-title"><strong>{entry.title}</strong>{entry.series&&<span className="muted">{entry.books.length} books</span>}</div>
 {confirm?<><p>{confirm==='download'?'Remove this EPUB from Quire? Your book details, progress, notes, and highlights will stay in the library.':`Remove ${entry.series?`all ${entry.books.length} books in this series`:'this book'} from your library? This deletes ${entry.series?'their':'its'} downloaded files, progress, bookmarks, highlights, and notes from Quire on this device.`}</p>{confirm==='library'&&<p className="muted">Original EPUB files and exported backups are kept.</p>}<div className="button-row"><button disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button><button className="danger" disabled={busy} onClick={()=>void run(confirm==='download'?onRemoveDownload:onDelete)}><Trash2/>{busy?'Removing…':confirm==='download'?'Remove download':`Remove ${entry.series?`${entry.books.length} books`:'from library'}`}</button></div></>:
 <div className="book-action-list"><button onClick={onOpen}>{entry.series?<FolderOpen/>:<BookOpen/>}{entry.series?'Open series':entry.books[0].local?'Read book':'Import EPUB to read'}</button>{!entry.series&&<button onClick={onDetails}><Info/>Book details</button>}{!entry.series&&entry.books[0].local&&<button onClick={()=>setConfirm('download')}><HardDriveDownload/>Remove download</button>}<button className="danger" onClick={()=>setConfirm('library')}><Trash2/>Remove from library</button></div>}
 {error&&<p className="error" role="alert">{error}</p>}
 </div></Modal>;
}
