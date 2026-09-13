import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Grid2X2, Info, List, LoaderCircle, Plus, Search, Settings2, X } from 'lucide-react';
import { defaults, type Book, type Preferences, type Position } from './domain/models';
import { entriesFor, restoreImport, type LibraryEntry } from './domain/library';
import { listBooks, putBook, saveBook, getFile, removeFile, loadPreferences, savePreferences } from './storage';
import { importEpub } from './epub';
import { Reader } from './features/reader/Reader';
import { BookDetails } from './features/library/BookDetails';
import { Settings } from './features/library/Settings';

function Cover({ entry }: { entry: LibraryEntry }) {
  const covers = entry.books.slice(0, 3);
  return <div className={`cover-frame ${entry.series ? 'stack' : ''}`} aria-hidden="true">{[...covers].reverse().map((book, index) => <div key={book.id} className="cover-layer" style={{ '--layer': covers.length - index - 1 } as CSSProperties}>{book.cover ? <img src={book.cover} alt="" /> : <div className="cover-fallback"><BookOpen /><span>{book.title}</span></div>}</div>)}</div>;
}
export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const booksRef = useRef<Book[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const preferencesRef = useRef(preferences);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [opened, setOpened] = useState<{ book: Book; bytes: Uint8Array } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(operation);
    queue.current = result.catch(e => { setError(e instanceof Error ? e.message : String(e)); });
    return result;
  };
  const refresh = (next: Book[]) => { booksRef.current = next; setBooks(next); };
  const replace = (book: Book) => refresh([...booksRef.current.filter(b => b.id !== book.id), book]);
  useEffect(() => {
    void Promise.all([listBooks(), loadPreferences()]).then(([savedBooks, savedPreferences]) => {
      refresh(savedBooks); preferencesRef.current = savedPreferences; setPreferences(savedPreferences);
    }).catch(e => setError(`Could not load your library: ${String(e)}`)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.style.setProperty('--accent', preferences.accent);
    document.documentElement.style.setProperty('--custom-bg', preferences.background);
    document.documentElement.style.setProperty('--custom-fg', preferences.foreground);
    const rgb = preferences.background.slice(1).match(/../g)?.map(n=>parseInt(n,16)) ?? [255,255,255];
    document.documentElement.style.setProperty('--custom-scheme', rgb[0]*.299+rgb[1]*.587+rgb[2]*.114 < 128 ? 'dark' : 'light');
  }, [preferences.theme, preferences.accent, preferences.background, preferences.foreground]);
  const changePreferences = (p: Preferences) => {
    preferencesRef.current = p; setPreferences(p);
    void enqueue(() => savePreferences(p)).catch(() => {});
  };
  const importFiles = async (files: File[]) => {
    setError(''); setNotice('');
    let imported = 0; const errors: string[] = [];
    for (const file of files) {
      setBusy(`Importing ${file.name}`);
      try {
        const result = await importEpub(file);
        await enqueue(async () => {
          const book = restoreImport(result.book, booksRef.current.find(b => b.id === result.book.id));
          await putBook(book, result.bytes); replace(book);
        });
        imported++;
      } catch (e) { errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBusy(''); setNotice(imported ? `${imported} ${imported === 1 ? 'book' : 'books'} imported.` : '');
    if (errors.length) setError(errors.join('\n'));
    if (imported) { setQuery(''); setReading(false); setGroup(null); }
    if (input.current) input.current.value = '';
  };
  const openBook = async (book: Book) => {
    if (!book.local) { setDetailsId(book.id); return; }
    setBusy('Opening book'); setError('');
    try {
      await queue.current;
      const bytes = await getFile(book.id);
      if (!bytes) throw new Error('The local EPUB is unavailable. Import the same file again to restore it.');
      setDetailsId(null); setOpened({ book: booksRef.current.find(b => b.id === book.id) ?? book, bytes });
    } catch (e) { setError(String(e)); } finally { setBusy(''); }
  };
  const savePosition = (position: Position) => {
    if (!opened) return;
    const book = booksRef.current.find(b => b.id === opened.book.id);
    if (!book) return;
    const next = { ...book, position }; replace(next);
    void enqueue(() => saveBook(next)).catch(() => {});
  };
  const entries = entriesFor(books, preferences, query, reading, group);
  const recent = [...books].filter(b => b.position).sort((a, b) => b.position!.updatedAt - a.position!.updatedAt)[0];
  const details = books.find(b => b.id === detailsId);
  const goLibrary = (read = false) => { setReading(read); setGroup(null); setQuery(''); };
  return <>
    <input className="file-input" ref={input} type="file" accept=".epub,application/epub+zip" multiple onChange={e => void importFiles(Array.from(e.target.files ?? []))} />
    {opened ? <Reader book={opened.book} bytes={opened.bytes} preferences={preferences.reader} onPreferences={reader => changePreferences({ ...preferencesRef.current, reader })} onPosition={savePosition} onClose={() => setOpened(null)} /> : <>
      <header className="topbar"><button className="wordmark" aria-label="Quire library" onClick={() => goLibrary()}>quire<span>.</span></button><nav className="sections" aria-label="Library sections"><button className={!reading ? 'selected' : ''} onClick={() => goLibrary()}>Library</button><button className={reading ? 'selected' : ''} onClick={() => goLibrary(true)}>Reading</button></nav>
        <div className="searchbox"><Search aria-hidden="true" /><input aria-label="Search library" placeholder="Search books" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon" aria-label="Clear search" onClick={() => setQuery('')}><X /></button>}</div>
        <button className="add-button" aria-label="Add books" disabled={!!busy || loading} onClick={() => input.current?.click()}><Plus /><span>Add books</span></button><button className="icon" aria-label="Appearance settings" onClick={() => setSettings(true)}><Settings2 /></button>
      </header>
      <main className="library" style={{ '--cover-size': `${preferences.coverSize}px` } as CSSProperties}>
        {reading && recent && !group && !query && <button className="continue-row" onClick={() => void openBook(recent)}><span>Continue reading<strong>{recent.title}</strong></span><span>{Math.round(recent.position!.fraction * 100)}%<ArrowRight /></span></button>}
        <div className="shelf-toolbar"><div className="shelf-label">{group && <button className="icon" aria-label="Back to all books" onClick={() => setGroup(null)}><ArrowLeft /></button>}<h1>{group ?? (reading ? 'Currently reading' : 'All books')}</h1><span className="muted">{entries.reduce((n, e) => n + e.books.length, 0)}</span></div><div className="view-controls"><label className="sort-label"><span className="sr-only">Sort books</span><select aria-label="Sort books" value={preferences.sort} onChange={e => changePreferences({ ...preferences, sort: e.target.value as Preferences['sort'] })}><option value="recent">Recent</option><option value="title">Title</option><option value="author">Author</option></select></label><div className="view-switch" role="group" aria-label="Library view"><button className={`icon ${preferences.view === 'grid' ? 'active' : ''}`} aria-label="Grid view" aria-pressed={preferences.view === 'grid'} onClick={() => changePreferences({ ...preferences, view: 'grid' })}><Grid2X2 /></button><button className={`icon ${preferences.view === 'list' ? 'active' : ''}`} aria-label="List view" aria-pressed={preferences.view === 'list'} onClick={() => changePreferences({ ...preferences, view: 'list' })}><List /></button></div></div></div>
        {loading ? <div className="empty"><LoaderCircle className="spin" /><p>Loading library</p></div> : !entries.length ? <div className="empty"><BookOpen /><h2>{query ? 'No books found' : reading ? 'Your next chapter starts here' : 'A place for your books'}</h2><p>{query ? 'Try another title, author, or series.' : reading ? 'Open a book from your library to start reading.' : 'Add an EPUB to start your library. Your books and progress stay on this device.'}</p><button className="primary" onClick={query ? () => setQuery('') : reading ? () => goLibrary() : () => input.current?.click()}>{query ? 'Clear search' : reading ? 'Browse library' : 'Add books'}</button></div> : <div className={`books ${preferences.view}`}>{entries.map(entry => {
          const book = entry.books[0];
          return <article className="book" key={entry.key}><button className="book-open" onClick={() => entry.series ? setGroup(book.series) : void openBook(book)} aria-label={entry.series ? `Open series ${entry.title}` : `Open ${entry.title}`}><Cover entry={entry} /><div className="book-copy"><h2 title={entry.title}>{entry.title}</h2><p className="book-author">{book.author}</p></div></button><div className="book-under"><span>{entry.series ? `${entry.books.length} volumes` : book.volume !== null ? `Volume ${book.volume}` : book.position ? `${Math.round(book.position.fraction * 100)}%` : 'Not started'}</span><div className="book-tail">{!entry.series && book.volume !== null && book.position && <span>{Math.round(book.position.fraction * 100)}%</span>}{!entry.series && !book.local && <span className="unavailable">File removed</span>}{!entry.series && <button className="icon" aria-label={`Details for ${book.title}`} onClick={() => setDetailsId(book.id)}><Info /></button>}</div></div></article>;
        })}{preferences.view === 'grid' && !reading && !query && <button className="add-book-tile" aria-label="Add book" title="Add book" disabled={!!busy} onClick={() => input.current?.click()}><Plus aria-hidden="true" /></button>}</div>}
      </main>
    </>}
    {busy && <div className="activity" role="status"><LoaderCircle className="spin" />{busy}</div>}
    {notice && !busy && <div className="notice" role="status"><Check />{notice}<button className="icon" aria-label="Dismiss notification" onClick={() => setNotice('')}><X /></button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon" aria-label="Dismiss error" onClick={() => setError('')}><X /></button></div>}
    {settings && <Settings preferences={preferences} onChange={changePreferences} onClose={() => setSettings(false)} />}
    {details && <BookDetails key={details.id} book={details} onClose={() => setDetailsId(null)} onRead={() => void openBook(details)} onImport={() => { setDetailsId(null); input.current?.click(); }} onSave={draft => enqueue(async () => { const latest = booksRef.current.find(b => b.id === draft.id)!; const next = { ...latest, title: draft.title, author: draft.author, series: draft.series, volume: draft.volume }; await saveBook(next); replace(next); })} onRemove={() => enqueue(async () => { await removeFile(details.id); replace({ ...booksRef.current.find(b => b.id === details.id)!, local: false }); })} />}
  </>;
}
