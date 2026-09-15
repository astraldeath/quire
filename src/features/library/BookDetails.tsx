import {TrackingDialog} from '../tracking/TrackingDialog';
import {TrackingButton} from '../tracking/TrackingButton';
import {useState} from 'react';
import {BookOpen, HardDriveDownload, Pencil, Trash2} from 'lucide-react';
import type {Book} from '../../domain/models';
import {Modal} from '../../components/Modal';
import {BookServerActions} from '../sync/BookServerActions';
import './book-details.css';

export function BookDetails({book,onClose,onSave,onRemove,onRead,onImport,onDelete,onTracking}:{
 book:Book;onClose:()=>void;onSave:(b:Book)=>Promise<void>;onRemove:()=>Promise<void>;
 onRead:()=>void;onImport:()=>void;onDelete:()=>void;onTracking?:()=>void;
}) {
 const [tracking,setTracking]=useState(false);
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState(book);
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();onClose();}catch(e){setError(String(e));}finally{setBusy(false);}};
 if(tracking)return <TrackingDialog book={book} onClose={()=>setTracking(false)}/>;
 return <Modal title="Book details" onClose={onClose}><div className="book-details-panel">
  <div className="details-intro">{book.cover&&<img src={book.cover} alt=""/>}<div>
   <h3>{book.title}</h3><p>{book.author||'Unknown author'}</p>
   {book.series&&<p className="muted">{book.series}{book.volume!==null?` · Volume ${book.volume}`:''}</p>}
   <p className="muted">{book.position?`${Math.round(book.position.fraction*100)}% read`:'Not started'}</p>
  </div></div>
  <div className="book-details-primary"><button type="button" className="primary" disabled={busy} onClick={onRead}>{book.local?<BookOpen/>:<HardDriveDownload/>}{book.local?'Open book':'Download and read'}</button>
   {!editing&&<button type="button" disabled={busy} onClick={()=>{setDraft(book);setEditing(true);}}><Pencil/>Edit details</button>}
  </div>
  {editing&&<form className="book-details-edit" onSubmit={e=>{e.preventDefault();void run(()=>onSave({...draft,title:draft.title.trim(),author:draft.author.trim(),series:draft.series.trim()}));}}>
   <h3>Edit details</h3><div className="form-grid">
    <label className="wide">Title<input required maxLength={1000} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <label className="wide">Author<input maxLength={1000} value={draft.author} onChange={e=>setDraft({...draft,author:e.target.value})}/></label>
    <label>Series<input maxLength={1000} value={draft.series} onChange={e=>setDraft({...draft,series:e.target.value})}/></label>
    <label>Volume<input type="number" min="0" step="any" value={draft.volume??''} onChange={e=>setDraft({...draft,volume:e.target.value===''?null:Number(e.target.value)})}/></label>
   </div><footer className="modal-footer"><button type="button" disabled={busy} onClick={()=>{setDraft(book);setEditing(false);setError('');}}>Cancel</button><button type="submit" className="primary" disabled={busy||!draft.title.trim()}>Save changes</button></footer>
  </form>}
  {error&&<p role="alert" className="error">{error}</p>}
  <section className="book-details-group" aria-label="Availability"><h3>Availability</h3>
   <div className="book-details-device"><span>{book.local?'On this device':'Not downloaded'}</span>
    {book.local?<button type="button" className="text-action" disabled={busy||confirm} onClick={()=>setConfirm(true)}><HardDriveDownload/>Remove download</button>:<button type="button" className="text-action" onClick={onImport}><HardDriveDownload/>Import EPUB instead</button>}
   </div>
   {confirm&&<div className="removal"><p>Remove the EPUB from this device? Your book details and reading position will stay in the library.</p><div className="button-row"><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Keep download</button><button type="button" className="danger" disabled={busy} onClick={()=>void run(onRemove)}>Remove download</button></div></div>}
   <BookServerActions book={book}/>
  </section>
  {import.meta.env.VITE_HOSTED==='true'&&<section className="book-details-group" aria-label="Tracking"><h3>Tracking</h3><TrackingButton bookId={book.id} onClick={()=>onTracking?onTracking():setTracking(true)}/></section>}
  <div className="book-details-remove"><button type="button" className="text-action danger" disabled={busy} onClick={onDelete}><Trash2/>Remove from library</button></div>
 </div></Modal>;
}
