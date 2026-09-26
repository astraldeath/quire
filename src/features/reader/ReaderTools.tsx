import { createPortal } from 'react-dom';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  Bookmark,
  BookOpen,
  Copy,
  Highlighter,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { View } from 'foliate-js/view.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import type { Annotation, Book } from '../../domain/models';
import {
  lookupDefinition,
  type DefinitionGroup,
  wiktionaryUrl,
} from './definitions';
import { ReaderDialog } from './ReaderDialog';
import { SelectionToolbar } from './SelectionToolbar';

type Selection = { cfi: string; text: string; doc: Document; range: Range };
export interface ReaderToolsHandle {
  search?(): void;
  bookmark(): void;
  close(): void;
}
interface Props {
  ref?: Ref<ReaderToolsHandle>;
  otherPanelOpen: boolean;
  onOpen(): void;
  toolbar: HTMLElement;
  view: View;
  book: Book;
  visible: boolean;
  fixedLayout?: boolean;
  onSave(items: Annotation[]): Promise<void>;
  navigate(cfi: string): Promise<boolean>;
}
export function ReaderTools({
  ref,
  otherPanelOpen,
  onOpen,
  toolbar,
  view,
  book,
  visible,
  fixedLayout = view.isFixedLayout,
  onSave,
  navigate,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [panel, setPanel] = useState<
    'saved' | 'note' | 'define' | 'search' | null
  >(null);
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searched, setSearched] = useState(false);
  const [dictionaryUrl, setDictionaryUrl] = useState('');
  const [definitions, setDefinitions] = useState<DefinitionGroup[]>([]);
  const [defining, setDefining] = useState(false);
  const [definitionError, setDefinitionError] = useState('');
  const [lookupAttempt, setLookupAttempt] = useState(0);
  useEffect(() => {
    if (panel !== 'define') return;
    const controller = new AbortController();
    let active = true;
    setDefining(true);
    setDefinitions([]);
    setDefinitionError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    void lookupDefinition(query, controller.signal)
      .then((result) => {
        if (active) setDefinitions(result);
      })
      .catch((error) => {
        if (active)
          setDefinitionError(
            controller.signal.aborted
              ? 'Wiktionary timed out. Try again.'
              : error instanceof Error
                ? error.message
                : 'Could not load this definition.',
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setDefining(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [panel, query, lookupAttempt]);
  const [results, setResults] = useState<{ cfi: string; text: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const current = useRef({ book, onSave });
  current.current = { book, onSave };
  const searchId = useRef(0);
  const searchWork = useRef<Promise<void>>(Promise.resolve());
  const items = book.annotations ?? [];
  useEffect(() => {
    if (message !== 'Copied') return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (otherPanelOpen) setPanel(null);
  }, [otherPanelOpen]);
  useEffect(() => {
    if (panel || otherPanelOpen) {
      selectionRef.current?.doc.getSelection()?.removeAllRanges();
      if (otherPanelOpen) setSelection(null);
    }
    if (panel) onOpen();
  }, [panel, otherPanelOpen]);
  const clearSelection = () => {
    selection?.doc.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  const close = () => {
    searchId.current++;
    view.clearSearch();
    setSearching(false);
    setPanel(null);
    setEditing(null);
    setMessage('');
    clearSelection();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selection]);
  useLayoutEffect(() => {
    const disposers: (() => void)[] = [];
    const installed = new WeakSet<Document>();
    const install = ({ doc, index }: { doc: Document; index: number }) => {
      if (view.isFixedLayout || installed.has(doc)) return;
      installed.add(doc);
      let timer: ReturnType<typeof setTimeout>;
      const changed = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const selected = doc.getSelection();
          if (
            !selected ||
            selected.isCollapsed ||
            !selected.rangeCount ||
            !selected.toString().trim()
          ) {
            setSelection(null);
            return;
          }
          try {
            setSelection({
              cfi: view.getCFI(index, selected.getRangeAt(0)),
              text: selected.toString().trim(),
              doc,
              range: selected.getRangeAt(0).cloneRange(),
            });
          } catch {
            setMessage('This selection could not be saved.');
          }
        }, 180);
      };
      doc.addEventListener('selectionchange', changed);
      disposers.push(() => {
        clearTimeout(timer);
        doc.removeEventListener('selectionchange', changed);
        doc.getSelection()?.removeAllRanges();
      });
    };
    const load = (event: Event) => install((event as CustomEvent).detail);
    const draw = (event: Event) => {
      const { draw } = (event as CustomEvent).detail;
      draw(Overlayer.highlight, { color: '#e9bc57' });
    };
    const restore = () =>
      queueMicrotask(() => {
        for (const item of current.current.book.annotations ?? [])
          if (!view.isFixedLayout && item.kind === 'highlight')
            void view
              .addAnnotation({ value: item.cfi })
              .catch(() => setMessage('A highlight could not be restored.'));
      });
    const relocated = () => {
      selectionRef.current?.doc.getSelection()?.removeAllRanges();
      setSelection(null);
    };
    view.addEventListener('load', load);
    view.addEventListener('draw-annotation', draw);
    view.addEventListener('create-overlay', restore);
    view.addEventListener('relocate', relocated);
    view.renderer.getContents().forEach(install);
    restore();
    return () => {
      disposers.forEach((fn) => fn());
      searchId.current++;
      view.clearSearch();
      view.removeEventListener('load', load);
      view.removeEventListener('draw-annotation', draw);
      view.removeEventListener('create-overlay', restore);
      view.removeEventListener('relocate', relocated);
    };
  }, [view]);
  const persist = async (next: Annotation[]) => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setMessage('');
    try {
      await current.current.onSave(next);
      return true;
    } catch {
      setMessage('Could not save changes. Try again.');
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const saveHighlight = async (withNote = false) => {
    const source = withNote ? editing : selection;
    if (!source) return;
    const previous = current.current.book.annotations ?? [];
    const existing = previous.find(
      (item) => item.kind === 'highlight' && item.cfi === source.cfi,
    );
    const item: Annotation = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: 'highlight',
      cfi: source.cfi,
      text: source.text,
      note: withNote ? note : (existing?.note ?? ''),
      section: book.position?.section ?? '',
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    if (await persist([...previous.filter((a) => a.id !== item.id), item])) {
      await view
        .addAnnotation({ value: item.cfi })
        .catch(() =>
          setMessage('Saved, but the highlight could not be drawn.'),
        );
      clearSelection();
      setPanel(withNote ? 'saved' : null);
      setEditing(null);
    }
  };
  const bookmark = async () => {
    const position = current.current.book.position;
    if (!position) return;
    const previous = current.current.book.annotations ?? [];
    const existing = previous.find(
      (a) => a.kind === 'bookmark' && a.cfi === position.cfi,
    );
    await persist(
      existing
        ? previous.filter((a) => a.id !== existing.id)
        : [
            ...previous,
            {
              id: crypto.randomUUID(),
              kind: 'bookmark',
              cfi: position.cfi,
              text: `${position.section || book.title} - ${Math.round(position.fraction * 100)}%`,
              note: '',
              section: position.section,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
    );
  };
  const remove = async (item: Annotation) => {
    if (
      await persist(
        (current.current.book.annotations ?? []).filter(
          (a) => a.id !== item.id,
        ),
      )
    )
      if (item.kind === 'highlight')
        await view
          .deleteAnnotation({ value: item.cfi })
          .catch(() =>
            setMessage('Removed; reopen this chapter to refresh the display.'),
          );
  };
  const define = () => {
    if (!selection) return;
    try {
      setDictionaryUrl(wiktionaryUrl(selection.text));
      setQuery(selection.text);
      setPanel('define');
      setMessage('');
      setSearching(false);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const go = async (cfi: string) => {
    if (await navigate(cfi)) close();
  };
  const search = async (term: string) => {
    term = term.trim();
    if (!term || fixedLayout) return;
    const id = ++searchId.current;
    setSearchInput(term);
    setSearched(true);
    setQuery(term);
    setPanel('search');
    setResults([]);
    setMessage('');
    setSearching(true);
    const work = searchWork.current.then(async () => {
      if (id !== searchId.current) return;
      try {
        for await (const batch of view.search({ query: term })) {
          if (id !== searchId.current) {
            view.clearSearch();
            break;
          }
          if (typeof batch !== 'string' && batch.subitems)
            setResults((old) => [
              ...old,
              ...batch.subitems!.map((r) => ({
                cfi: r.cfi,
                text: r.excerpt.pre + r.excerpt.match + r.excerpt.post,
              })),
            ]);
        }
      } catch {
        if (id === searchId.current) setMessage('Could not search this book.');
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    });
    searchWork.current = work;
    await work;
  };
  const marked = items.some(
    (a) => a.kind === 'bookmark' && a.cfi === book.position?.cfi,
  );
  useImperativeHandle(ref, () => ({
    search: fixedLayout
      ? undefined
      : () => {
          setPanel('search');
          setMessage('');
        },
    bookmark: () => {
      void bookmark();
    },
    close,
  }));
  return (
    <>
      {visible &&
        !panel &&
        createPortal(
          <div className="reader-tools" aria-label="Reading tools">
            <button
              title="Search in book"
              aria-label="Search in book"
              onClick={() => {
                setPanel('search');
                setMessage('');
              }}
            >
              <Search />
            </button>
            <button
              title={fixedLayout ? 'Bookmarks' : 'Bookmarks and highlights'}
              aria-label={
                fixedLayout ? 'Bookmarks' : 'Bookmarks and highlights'
              }
              onClick={() => {
                setPanel('saved');
                setMessage('');
              }}
            >
              <Bookmark />
            </button>
          </div>,
          toolbar,
        )}
      {selection && !panel && !otherPanelOpen && (
        <SelectionToolbar range={selection.range} doc={selection.doc}>
          <button
            title="Copy"
            aria-label="Copy selected text"
            onClick={() => {
              void navigator.clipboard
                .writeText(selection.text)
                .then(() => {
                  setMessage('Copied');
                  clearSelection();
                })
                .catch(() =>
                  setMessage('Could not copy. Use the system Copy action.'),
                );
            }}
          >
            <Copy />
          </button>
          <button
            title="Highlight"
            aria-label="Highlight selection"
            disabled={busy}
            onClick={() => void saveHighlight()}
          >
            <Highlighter />
          </button>
          <button
            title="Add note"
            aria-label="Add note"
            onClick={() => {
              setEditing({
                id: '',
                kind: 'highlight',
                cfi: selection.cfi,
                text: selection.text,
                note: '',
                section: book.position?.section ?? '',
                createdAt: 0,
                updatedAt: 0,
              });
              setNote('');
              setPanel('note');
            }}
          >
            <Pencil />
          </button>
          <button
            title="Define (English, online)"
            aria-label="Define selected text"
            onClick={() => void define()}
          >
            <BookOpen />
          </button>
          <button
            title="Search in book"
            aria-label="Search selected text in book"
            onClick={() => void search(selection.text)}
          >
            <Search />
          </button>
          <button
            title="Clear selection"
            aria-label="Clear selection"
            onClick={clearSelection}
          >
            <X />
          </button>
        </SelectionToolbar>
      )}
      {panel && (
        <ReaderDialog
          onClose={close}
          label={
            panel === 'saved'
              ? fixedLayout
                ? 'Bookmarks'
                : 'Bookmarks and highlights'
              : panel === 'note'
                ? 'Edit note'
                : panel === 'define'
                  ? 'Definition'
                  : 'Search in book'
          }
        >
          <div className="reader-panel-heading">
            <h2>
              {panel === 'saved'
                ? fixedLayout
                  ? 'Bookmarks'
                  : 'Bookmarks & highlights'
                : panel === 'note'
                  ? 'Note'
                  : panel === 'define'
                    ? 'Definition'
                    : 'Search in book'}
            </h2>
            <button aria-label="Close reading tools" onClick={close}>
              <X />
            </button>
          </div>
          {panel === 'saved' && (
            <div className="saved-annotations">
              <button
                className="bookmark-current"
                disabled={busy || !book.position}
                onClick={() => void bookmark()}
              >
                <Bookmark fill={marked ? 'currentColor' : 'none'} />
                {marked ? 'Remove bookmark' : 'Bookmark this page'}
              </button>
              {!items.length && (
                <p>
                  {fixedLayout
                    ? 'No bookmarks.'
                    : 'No bookmarks or highlights. Select text to highlight it.'}
                </p>
              )}
              {items.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.kind === 'bookmark' ? 'saved-bookmark' : undefined
                  }
                >
                  <button
                    className="annotation-jump"
                    onClick={() => {
                      void go(item.cfi);
                    }}
                  >
                    {item.kind === 'bookmark' ? <Bookmark /> : <Highlighter />}
                    <span>
                      {item.text}
                      {item.section &&
                        item.section !== item.text &&
                        !item.text.startsWith(`${item.section} - `) && (
                          <small>{item.section}</small>
                        )}
                      {item.kind === 'bookmark' && (
                        <small>
                          {new Date(item.createdAt).toLocaleString()}
                        </small>
                      )}
                    </span>
                  </button>
                  {item.note && <p>{item.note}</p>}
                  <div>
                    {item.kind === 'highlight' && (
                      <button
                        aria-label="Edit note"
                        onClick={() => {
                          setEditing(item);
                          setNote(item.note);
                          setPanel('note');
                        }}
                      >
                        <Pencil /> Note
                      </button>
                    )}
                    <button
                      aria-label="Delete saved passage"
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {panel === 'note' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveHighlight(true);
              }}
            >
              <blockquote>{editing?.text ?? selection?.text}</blockquote>
              <label>
                Note
                <textarea
                  autoFocus
                  rows={6}
                  value={note}
                  maxLength={10000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Save note
              </button>
            </form>
          )}
          {panel === 'define' && (
            <div className="dictionary-entry">
              <h3>{query}</h3>
              {defining && <p role="status">Looking up definition…</p>}
              {definitions.map((group, index) => (
                <section key={index}>
                  <h4>{group.partOfSpeech}</h4>
                  <ol>
                    {group.senses.map((sense, i) => (
                      <li key={i}>{sense}</li>
                    ))}
                  </ol>
                </section>
              ))}
              {definitionError && (
                <div>
                  <p role="status">{definitionError}</p>
                  <button onClick={() => setLookupAttempt((n) => n + 1)}>
                    Try again
                  </button>
                </div>
              )}
              <small>
                Definitions adapted from{' '}
                <a href={dictionaryUrl} target="_blank" rel="noreferrer">
                  Wiktionary
                </a>
                ,{' '}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY-SA 4.0
                </a>
                .
              </small>
            </div>
          )}
          {panel === 'search' && (
            <div className="search-results">
              {fixedLayout ? (
                <p>Search is unavailable for this page-based book.</p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void search(searchInput);
                  }}
                >
                  <label>
                    Search text
                    <input
                      autoFocus
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={!searchInput.trim()}>
                    Search
                  </button>
                </form>
              )}
              {searched && (
                <p role="status">
                  {results.length} matches for "{query}"
                </p>
              )}
              {searched && !searching && !results.length && !message && (
                <p>No matches found.</p>
              )}
              {results.map((r, i) => (
                <button key={i} onClick={() => void go(r.cfi)}>
                  {r.text}
                </button>
              ))}
            </div>
          )}
          {searching && (
            <p role="status">
              {panel === 'define' ? 'Looking up definition…' : 'Searching…'}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </ReaderDialog>
      )}
      {!panel && message && (
        <div className="reader-tool-message" role="status">
          {message}
          <button
            aria-label="Dismiss reading notification"
            onClick={() => setMessage('')}
          >
            <X />
          </button>
        </div>
      )}
    </>
  );
}
