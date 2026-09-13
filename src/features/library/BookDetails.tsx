import { useState } from 'react';
import { BookOpen, HardDriveDownload, Trash2 } from 'lucide-react';
import type { Book } from '../../domain/models';
import { Modal } from '../../components/Modal';
export function BookDetails({ book, onClose, onSave, onRemove, onRead, onImport }: {
  book: Book; onClose: () => void; onSave: (b: Book) => Promise<void>; onRemove: () => Promise<void>; onRead: () => void; onImport: () => void;
}) {
  const [draft, setDraft] = useState(book);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); onClose(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  return <Modal title="Book details" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void run(() => onSave({ ...draft, title: draft.title.trim(), author: draft.author.trim(), series: draft.series.trim() })); }}>
    <div className="details-intro">{book.cover && <img src={book.cover} alt="" />}<div><h3>{book.title}</h3><p>{book.author || 'Unknown author'}</p><p className="muted">{book.local ? 'On this device' : 'No local file'}{book.position ? ` · ${Math.round(book.position.fraction * 100)}% read` : ''}</p><button type="button" className="text-action" onClick={book.local ? onRead : onImport}>{book.local ? <BookOpen /> : <HardDriveDownload />}{book.local ? 'Open book' : 'Import EPUB to read'}</button></div></div>
    <div className="form-grid"><label className="wide">Title<input required maxLength={1000} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label className="wide">Author<input maxLength={1000} value={draft.author} onChange={e => setDraft({ ...draft, author: e.target.value })} /></label><label>Series<input maxLength={1000} value={draft.series} onChange={e => setDraft({ ...draft, series: e.target.value })} /></label><label>Volume<input type="number" min="0" step="any" value={draft.volume ?? ''} onChange={e => setDraft({ ...draft, volume: e.target.value === '' ? null : Number(e.target.value) })} /></label></div>
    {error && <p role="alert" className="error">{error}</p>}
    {confirm ? <div className="removal"><p>Remove the EPUB from this device? Your book details and reading position will stay in the library.</p><div className="button-row"><button type="button" onClick={() => setConfirm(false)}>Keep download</button><button type="button" className="danger" disabled={busy} onClick={() => void run(onRemove)}>Remove download</button></div></div> : book.local && <button type="button" className="text-action danger" onClick={() => setConfirm(true)}><Trash2 />Remove download</button>}
    <footer className="modal-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy || !draft.title.trim()}>Save changes</button></footer>
  </form></Modal>;
}
