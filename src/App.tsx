import {
  startStorageManagement,
  protectOpenBook,
} from './features/storage/manager';
import type { ActionAnchor } from './components/ActionPopover';
import { LibraryControls } from './features/library/LibraryControls';
import { Modal } from './components/Modal';
import { Wordmark } from './components/Wordmark';
import { PrivacyProvider, usePrivacy } from './features/privacy/Privacy';
import { PrivacyMenu } from './features/privacy/PrivacyMenu';
import { visibleBook } from './features/privacy/model';
import { LockKeyhole } from 'lucide-react';
import {
  hostedWeb,
  useWebPath,
  parseWebRoute,
  navigateWeb,
  closeWeb,
  shelfPath,
} from './features/navigation/routes';
import { BookOpenButton } from './features/library/BookOpenButton';
import { ensureBookFile } from './features/sync/library';
import { startSync } from './features/sync/engine';
import { TrackingDialog } from './features/tracking/TrackingDialog';
import { TrackingButton } from './features/tracking/TrackingButton';
import { isTauri } from '@tauri-apps/api/core';
import { startNativeTracking } from './features/tracking/native';
import { BookActions } from './features/library/BookActions';
import { createBackup, type Backup } from './features/backup/archive';
import { mergeBook } from './features/backup/merge';
import { preserveExistingProgress } from './features/statistics/history';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useDeferredValue,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CloudDownload,
  Ellipsis,
  Download,
  CheckSquare,
  Trash2,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  defaults,
  type Annotation,
  type Book,
  type Preferences,
  type Position,
} from './domain/models';
import {
  entriesFor,
  restoreImport,
  readingStatus,
  continueBook,
  type LibraryEntry,
} from './domain/library';
import {
  markBooksRead,
  deleteBooks,
  restoreBooks,
  saveReadingPosition,
  saveBookAnnotations,
  listBooks,
  putBook,
  saveBook,
  getFile,
  removeFile,
  loadPreferences,
  savePreferences,
  listReadingActivity,
  saveReadingActivity,
} from './storage';
import { importEpub } from './epub';
import { Reader } from './features/reader/Reader';
import { BookDetails } from './features/library/BookDetails';
import { Settings } from './features/library/Settings';

function Cover({ entry }: { entry: LibraryEntry }) {
  const covers = entry.books.slice(0, 3);
  return (
    <div
      className={`cover-frame ${entry.series ? 'stack' : ''}`}
      aria-hidden="true"
    >
      {[...covers].reverse().map((book, index) => (
        <div
          key={book.id}
          className="cover-layer"
          style={{ '--layer': covers.length - index - 1 } as CSSProperties}
        >
          {book.cover ? (
            <img src={book.cover} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="cover-fallback">
              <BookOpen />
              <span>{book.title}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function AppContent({
  accountActions,
  serverLibraries = [],
  onImport,
}: {
  accountActions?: ReactNode;
  serverLibraries?: { id: string; name: string; bookIds: string[] }[];
  onImport?: (id: string, bytes: Uint8Array) => Promise<void>;
} = {}) {
  const privacy = usePrivacy();
  const wasUnlocked = useRef(false);
  const [hiddenBooks, setHiddenBooks] = useState(false);
  const webPath = useWebPath();
  const route = parseWebRoute(webPath);
  const scrollKey = ['library', 'reading', 'series'].includes(route.kind)
    ? webPath
    : route.kind === 'series-tracking'
      ? '/series/' + encodeURIComponent(route.series!)
      : shelfPath();
  const [bookTracking, setBookTracking] = useState<string | null>(null);
  const [seriesTracking, setSeriesTracking] = useState<string | null>(null);
  const [libraryScope, setLibraryScope] = useState('all');
  const [status, setStatus] = useState('all'),
    [availability, setAvailability] = useState('all');
  const [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [bulkRemove, setBulkRemove] = useState(false);
  const [seriesSort, setSeriesSort] = useState<Preferences['sort']>('volume');

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
  const [actions, setActions] = useState<{
    entry: LibraryEntry;
    initialRemove?: boolean;
    anchor?: ActionAnchor;
  } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [opened, setOpened] = useState<{
    book: Book;
    bytes: Uint8Array;
  } | null>(null);
  protectOpenBook(opened?.book.id ?? null);
  const input = useRef<HTMLInputElement>(null);
  const shelfElement = useRef<HTMLElement>(null);
  const shelfScroll = useRef(new Map<string, number>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(operation);
    queue.current = result.catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });
    return result;
  };
  const refresh = (next: Book[]) => {
    booksRef.current = next;
    setBooks(next);
  };
  const replace = (book: Book) =>
    refresh([...booksRef.current.filter((b) => b.id !== book.id), book]);
  useEffect(() => {
    const update = () => {
      void enqueue(async () => refresh(await listBooks())).catch(() => {});
    };
    window.addEventListener('quire-synced', update);
    const stop = startSync();
    const stopTracking = startNativeTracking();
    const stopStorage = startStorageManagement();
    return () => {
      stop();
      stopTracking();
      stopStorage();
      window.removeEventListener('quire-synced', update);
    };
  }, []);
  useEffect(() => {
    void Promise.all([listBooks(), loadPreferences()])
      .then(async ([savedBooks, savedPreferences]) => {
        refresh(savedBooks);
        preferencesRef.current = savedPreferences;
        setPreferences(savedPreferences);
        try {
          await preserveExistingProgress(savedBooks);
        } catch {
          setError(
            'Could not save earlier reading history. Reopen Quire to retry.',
          );
        }
      })
      .catch((e) => setError(`Could not load your library: ${String(e)}`))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const upgraded = () =>
      setError(
        'Quire was updated in another tab. Reload this tab to continue.',
      );
    window.addEventListener('quire-database-upgraded', upgraded);
    return () =>
      window.removeEventListener('quire-database-upgraded', upgraded);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.style.setProperty('--accent', preferences.accent);
    document.documentElement.style.setProperty(
      '--custom-bg',
      preferences.background,
    );
    document.documentElement.style.setProperty(
      '--custom-fg',
      preferences.foreground,
    );
    const rgb = preferences.background
      .slice(1)
      .match(/../g)
      ?.map((n) => parseInt(n, 16)) ?? [255, 255, 255];
    document.documentElement.style.setProperty(
      '--custom-scheme',
      rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128 ? 'dark' : 'light',
    );
  }, [
    preferences.theme,
    preferences.accent,
    preferences.background,
    preferences.foreground,
  ]);
  useEffect(() => {
    if (!notice || busy) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, busy]);
  const changePreferences = (p: Preferences) => {
    preferencesRef.current = p;
    setPreferences(p);
    void enqueue(() => savePreferences(p)).catch(() => {});
  };
  const importFiles = async (files: File[]) => {
    setError('');
    setNotice('');
    let imported = 0;
    const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      setBusy(`Importing ${index + 1} of ${files.length}: ${file.name}`);
      try {
        const result = await importEpub(file);
        await enqueue(async () => {
          const book = restoreImport(
            result.book,
            booksRef.current.find((b) => b.id === result.book.id),
          );
          await putBook(book, result.bytes);
          replace(book);
        });
        if (onImport) {
          setBusy(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
          await onImport(result.book.id, result.bytes);
        }
        imported++;
      } catch (e) {
        errors.push(
          `${file.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    setBusy('');
    setNotice(
      imported
        ? `${imported} ${imported === 1 ? 'book' : 'books'} imported.`
        : '',
    );
    if (errors.length) setError(errors.join('\n'));
    if (imported) {
      if (hostedWeb) navigateWeb('/library');
      else {
        setQuery('');
        setReading(false);
        setGroup(null);
      }
    }
    if (input.current) input.current.value = '';
  };
  const openBook = async (book: Book) => {
    if (!privacy.access(book.id) && !(await privacy.authenticate())) return;
    if (hostedWeb) {
      navigateWeb('/books/' + book.id + '/read');
      return;
    }
    if (busy) return;
    setBusy(book.local ? 'Opening book' : `Downloading ${book.title}…`);
    setError('');
    try {
      await queue.current;
      const bytes = await ensureBookFile(book.id);
      if (!privacy.access(book.id)) return;
      refresh(await listBooks());
      if (!bytes)
        throw new Error(
          'The local EPUB is unavailable. Import the same file again to restore it.',
        );
      setDetailsId(null);
      setOpened({
        book: booksRef.current.find((b) => b.id === book.id) ?? book,
        bytes,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  };
  const routeBookExists =
    !!route.bookId && books.some((b) => b.id === route.bookId);
  useEffect(() => {
    if (!hostedWeb) return;
    if (location.pathname === '/') {
      navigateWeb('/library' + location.search, true);
      return;
    }
    const current = parseWebRoute(webPath);
    const shelf = ['library', 'reading', 'series'].includes(current.kind)
      ? current
      : current.kind === 'series-tracking'
        ? { kind: 'series', series: current.series }
        : parseWebRoute(shelfPath());
    setReading(shelf.kind === 'reading');
    setGroup(shelf.series ?? null);
    setActions(null);
    setSettings(current.kind === 'settings');
    setDetailsId(
      current.kind === 'details' && privacy.access(current.bookId!)
        ? current.bookId!
        : null,
    );
    setBookTracking(
      current.kind === 'tracking' && privacy.access(current.bookId!)
        ? current.bookId!
        : null,
    );
    setSeriesTracking(
      current.kind === 'series-tracking' ? current.series! : null,
    );
    const params = new URLSearchParams(
      (['library', 'reading', 'series'].includes(current.kind)
        ? webPath
        : shelfPath()
      ).split('?')[1] ?? '',
    );
    setQuery(params.get('q') ?? '');
    setLibraryScope(params.get('collection') ?? 'all');
    setStatus(
      ['unread', 'reading', 'finished'].includes(params.get('status') ?? '')
        ? params.get('status')!
        : 'all',
    );
    setSeriesSort(
      ['volume', 'last-read', 'added', 'title', 'author'].includes(
        params.get('sort') ?? '',
      )
        ? (params.get('sort') as Preferences['sort'])
        : 'volume',
    );
    setAvailability(
      ['downloaded', 'cloud'].includes(params.get('availability') ?? '')
        ? params.get('availability')!
        : 'all',
    );
    setError('');
    if (current.kind !== 'read') {
      setOpened(null);
      if (
        current.bookId &&
        routeBookExists &&
        !privacy.access(current.bookId)
      ) {
        void privacy.authenticate().then((ok) => {
          if (location.pathname !== webPath.split('?')[0]) return;
          if (!ok) navigateWeb('/library', true);
          else if (current.kind === 'details') setDetailsId(current.bookId!);
          else if (current.kind === 'tracking')
            setBookTracking(current.bookId!);
        });
      }
      return;
    }
    setOpened(null);
    if (loading || !routeBookExists) return;
    let cancelled = false;
    setBusy('Opening book');
    void (async () => {
      if (!privacy.access(current.bookId!) && !(await privacy.authenticate())) {
        if (!cancelled) navigateWeb('/library', true);
        return;
      }
      if (cancelled) return;
      await queue.current;
      const bytes = await ensureBookFile(current.bookId!);
      if (cancelled || !privacy.access(current.bookId!)) return;
      if (!bytes) throw new Error('This book is unavailable.');
      const saved = await listBooks();
      if (cancelled) return;
      refresh(saved);
      const book = saved.find((b) => b.id === current.bookId);
      if (!book) throw new Error('This book is no longer in your library.');
      setOpened({ book, bytes });
    })()
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Could not open the book.');
      })
      .finally(() => {
        if (!cancelled) setBusy('');
      });
    return () => {
      cancelled = true;
      setBusy('');
    };
  }, [webPath, loading, routeBookExists]);
  useEffect(() => {
    const relocked = wasUnlocked.current && !privacy.unlocked;
    wasUnlocked.current = privacy.unlocked;
    if (!relocked) return;
    setHiddenBooks(false);
    setSelected([]);
    setActions(null);
    setDetailsId(null);
    setBookTracking(null);
    setSeriesTracking(null);
    if (opened && !privacy.access(opened.book.id)) {
      setOpened(null);
      if (hostedWeb) navigateWeb('/library', true);
    }
  }, [privacy.unlocked]);
  useEffect(() => {
    if (hostedWeb)
      document.title =
        (route.kind === 'read' ||
        route.kind === 'details' ||
        route.kind === 'tracking'
          ? privacy.access(route.bookId!)
            ? (books.find((b) => b.id === route.bookId)?.title ?? 'Book')
            : 'Private book'
          : route.series ||
            (
              {
                library: 'Library',
                reading: 'Reading',
                settings: 'Settings',
                admin: 'Administration',
                account: 'Account',
                'not-found': 'Page not found',
              } as Record<string, string>
            )[route.kind]) + ' · Quire';
  }, [webPath, books, privacy.unlocked]);
  useLayoutEffect(() => {
    if (hostedWeb && shelfElement.current)
      shelfElement.current.scrollTop = shelfScroll.current.get(scrollKey) ?? 0;
  }, [scrollKey, !!opened, loading]);
  const goGroup = (name: string | null) => {
    if (hostedWeb)
      navigateWeb(name ? '/series/' + encodeURIComponent(name) : '/library');
    else setGroup(name);
  };
  const goDetails = (id: string | null) => {
    if (hostedWeb) {
      if (id) navigateWeb('/books/' + id);
      else closeWeb();
    } else setDetailsId(id);
  };
  const goSettings = (open: boolean) => {
    if (hostedWeb) {
      if (open) navigateWeb('/settings/appearance');
      else closeWeb();
    } else setSettings(open);
  };
  const goTracking = async (book: Book, series?: string) => {
    if (!privacy.access(book.id) && !(await privacy.authenticate())) return;
    if (hostedWeb)
      navigateWeb(
        series
          ? '/series/' + encodeURIComponent(series) + '/tracking'
          : '/books/' + book.id + '/tracking',
      );
    else {
      setSeriesTracking(series ?? null);
      setBookTracking(series ? null : book.id);
    }
  };
  const changeFilter = (key: string, value: string) => {
    if (!hostedWeb) {
      if (key === 'q') setQuery(value);
      else if (key === 'collection') setLibraryScope(value);
      else if (key === 'status') setStatus(value);
      else if (key === 'sort') setSeriesSort(value as Preferences['sort']);
      else setAvailability(value);
      return;
    }
    const params = new URLSearchParams(location.search);
    if (value && value !== 'all') params.set(key, value);
    else params.delete(key);
    navigateWeb(
      location.pathname + (params.size ? '?' + params.toString() : ''),
      true,
    );
  };
  const savePosition = (position: Position) => {
    if (!opened) return;
    const book = booksRef.current.find((b) => b.id === opened.book.id);
    if (!book) return;
    const next = { ...book, position };
    replace(next);
    void enqueue(() => saveReadingPosition(book.id, position)).catch(() => {});
  };
  const saveAnnotations = async (annotations: Annotation[]) => {
    if (!opened) return;
    const latest = booksRef.current.find((b) => b.id === opened.book.id);
    if (!latest) throw new Error('Book is unavailable.');
    await enqueue(() => saveBookAnnotations(latest.id, annotations));
    const current = booksRef.current.find((b) => b.id === latest.id);
    if (current) replace({ ...current, annotations });
  };
  const prepareBackup = (kind: Backup['kind']) =>
    enqueue(async () => {
      if (
        Object.keys(privacy.state.books).some((id) => !privacy.access(id)) &&
        !(await privacy.authenticate())
      )
        throw new Error('Unlock private books to export a backup.');
      const saved = await listBooks();
      const records = [];
      for (const book of saved) {
        const file =
          kind === 'full' && book.local ? await getFile(book.id) : undefined;
        if (kind === 'full' && book.local && !file)
          throw new Error(`The file for ${book.title} is unavailable.`);
        records.push({ book, file });
      }
      await preserveExistingProgress(saved);
      return createBackup(
        records,
        preferencesRef.current,
        kind,
        await listReadingActivity(),
      );
    });
  const restoreBackup = (backup: Backup, settings: boolean) =>
    enqueue(async () => {
      const current = await listBooks();
      const records = backup.records.map(({ book, file }) => ({
        book: mergeBook(
          current.find((b) => b.id === book.id),
          book,
        ),
        file,
      }));
      await restoreBooks(records, backup.activities ?? []);
      await preserveExistingProgress(records.map((r) => r.book));
      refresh(await listBooks());
      if (settings) {
        const next = {
          ...backup.preferences,
          lastBackupAt: preferencesRef.current.lastBackupAt,
        };
        try {
          await savePreferences(next);
          preferencesRef.current = next;
          setPreferences(next);
        } catch {
          throw new Error(
            'Books and saved passages were restored. Settings could not be saved; retry the restore.',
          );
        }
      }
    });
  const markExported = () =>
    enqueue(async () => {
      const next = { ...preferencesRef.current, lastBackupAt: Date.now() };
      await savePreferences(next);
      preferencesRef.current = next;
      setPreferences(next);
    });
  const showActions = async (
    entry: LibraryEntry,
    initialRemove = false,
    anchor?: ActionAnchor,
  ) => {
    const members = entry.series
      ? booksRef.current.filter(
          (b) =>
            b.series === entry.books[0].series &&
            visibleBook(privacy.state, b.id, hiddenBooks, privacy.unlocked),
        )
      : entry.books;
    if (
      members.some((b) => !privacy.access(b.id)) &&
      !(await privacy.authenticate())
    )
      return;
    setActions({ entry: { ...entry, books: members }, initialRemove, anchor });
  };
  const removeFromLibrary = (ids: string[]) =>
    enqueue(async () => {
      await deleteBooks(ids);
      const next = booksRef.current.filter((b) => !ids.includes(b.id));
      refresh(next);
      if (detailsId && ids.includes(detailsId)) setDetailsId(null);
      if (group && !next.some((b) => b.series === group)) setGroup(null);
      if (
        hostedWeb &&
        (ids.includes(route.bookId ?? '') ||
          (group && !next.some((b) => b.series === group)))
      )
        navigateWeb('/library', true);
      setNotice(
        `${ids.length === 1 ? 'Book' : `${ids.length} books`} removed from library.`,
      );
    });
  const shelfBooks = useMemo(
    () =>
      books.filter((b) =>
        visibleBook(privacy.state, b.id, hiddenBooks, privacy.unlocked),
      ),
    [books, privacy.state, hiddenBooks, privacy.unlocked],
  );
  const scopedBooks = useMemo(
    () =>
      libraryScope === 'all'
        ? shelfBooks
        : shelfBooks.filter((b) =>
            libraryScope === 'personal'
              ? !serverLibraries.some((l) => l.bookIds.includes(b.id))
              : serverLibraries
                  .find((l) => l.id === libraryScope)
                  ?.bookIds.includes(b.id),
          ),
    [shelfBooks, libraryScope, serverLibraries],
  );
  const deferredQuery = useDeferredValue(query);
  const shelfPreferences = group
    ? { ...preferences, sort: seriesSort }
    : preferences;
  const entries = useMemo(
    () =>
      entriesFor(scopedBooks, shelfPreferences, deferredQuery, reading, group, {
        status:
          reading && status === 'all'
            ? undefined
            : (status as 'all' | 'unread' | 'reading' | 'finished'),
        availability: availability as 'all' | 'downloaded' | 'cloud',
      }),
    [
      scopedBooks,
      preferences,
      seriesSort,
      deferredQuery,
      reading,
      group,
      status,
      availability,
    ],
  );
  const seriesBooks = group
    ? scopedBooks.filter((b) => b.series === group)
    : [];
  const recent = continueBook(scopedBooks);
  const seriesNext =
    continueBook(seriesBooks) ??
    seriesBooks
      .filter((b) => readingStatus(b) === 'unread')
      .sort((a, b) => (a.volume ?? Infinity) - (b.volume ?? Infinity))[0];
  const visibleIds = entries.flatMap((e) => e.books.map((b) => b.id));
  const activeIds = selected.filter((id) => visibleIds.includes(id));
  const toggleEntry = (entry: LibraryEntry) => {
    const ids = entry.books.map((b) => b.id);
    setSelected((old) =>
      ids.every((id) => old.includes(id))
        ? old.filter((id) => !ids.includes(id))
        : [...new Set([...old, ...ids])],
    );
  };
  const batch = async (
    ids: string[],
    action: 'download' | 'finished' | 'unread' | 'remove-download',
  ) => {
    if (
      ids.some((id) => !privacy.access(id)) &&
      !(await privacy.authenticate())
    )
      return;
    if (busy) return;
    setBusy(action === 'download' ? 'Downloading books…' : 'Updating books…');
    setError('');
    let failures = 0;
    try {
      if (action === 'finished' || action === 'unread')
        await enqueue(() => markBooksRead(ids, action === 'finished'));
      else
        for (let index = 0; index < ids.length; index++) {
          setBusy(
            `${action === 'download' ? 'Downloading' : 'Removing downloads'} ${index + 1} of ${ids.length}`,
          );
          try {
            if (action === 'download') {
              if (!(await ensureBookFile(ids[index])))
                throw new Error('Unavailable');
            } else await enqueue(() => removeFile(ids[index]));
          } catch {
            failures++;
          }
        }
      refresh(await listBooks());
      if (failures)
        setError(
          `${failures} of ${ids.length} books could not be updated. Try again when the files are available.`,
        );
      else
        setNotice(
          `${ids.length} ${ids.length === 1 ? 'book' : 'books'} updated.`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update books.');
    } finally {
      setBusy('');
    }
  };

  const details = books.find((b) => b.id === detailsId && privacy.access(b.id));
  const goLibrary = (read = false) => {
    setHiddenBooks(false);
    if (hostedWeb) {
      navigateWeb(read ? '/reading' : '/library');
      return;
    }
    setReading(read);
    setGroup(null);
    setQuery('');
  };
  return (
    <>
      <input
        className="file-input"
        ref={input}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        onChange={(e) => void importFiles(Array.from(e.target.files ?? []))}
      />
      {opened && privacy.access(opened.book.id) ? (
        <Reader
          book={books.find((b) => b.id === opened.book.id) ?? opened.book}
          onAnnotations={saveAnnotations}
          bytes={opened.bytes}
          preferences={preferences.reader}
          onPreferences={(reader) =>
            changePreferences({ ...preferencesRef.current, reader })
          }
          onPosition={savePosition}
          onActivity={(activity) => {
            void saveReadingActivity([activity]).catch(() =>
              setError(
                'Could not save reading history. Free up device storage and try again.',
              ),
            );
          }}
          onClose={() => (hostedWeb ? closeWeb() : setOpened(null))}
        />
      ) : (
        <div className="library-shell">
          <header className="topbar">
            <button
              className="wordmark"
              aria-label="Quire library"
              onClick={() => goLibrary()}
            >
              <Wordmark />
            </button>
            <nav className="sections" aria-label="Library sections">
              <button
                className={!reading ? 'selected' : ''}
                onClick={() => goLibrary()}
              >
                Library
              </button>
              <button
                className={reading ? 'selected' : ''}
                onClick={() => goLibrary(true)}
              >
                Reading
              </button>
            </nav>
            <div className="searchbox">
              <Search aria-hidden="true" />
              <input
                aria-label="Search library"
                placeholder="Search books"
                value={query}
                onChange={(e) => changeFilter('q', e.target.value)}
              />
              {query && (
                <button
                  className="icon"
                  aria-label="Clear search"
                  onClick={() => changeFilter('q', '')}
                >
                  <X />
                </button>
              )}
            </div>
            <button
              className="add-button"
              aria-label="Add books"
              disabled={!!busy || loading}
              onClick={() => input.current?.click()}
            >
              <Plus />
              <span>Add books</span>
            </button>
            <button
              className="icon"
              aria-label="Settings"
              onClick={() => goSettings(true)}
            >
              <Settings2 />
            </button>
            {accountActions}
          </header>
          <main
            ref={shelfElement}
            onScroll={(e) => {
              if (hostedWeb)
                shelfScroll.current.set(scrollKey, e.currentTarget.scrollTop);
            }}
            className="library"
            style={
              { '--cover-size': `${preferences.coverSize}px` } as CSSProperties
            }
          >
            {reading &&
              recent &&
              !group &&
              !query &&
              status === 'all' &&
              availability === 'all' && (
                <button
                  className="continue-row"
                  onClick={() => void openBook(recent)}
                >
                  <span>
                    Continue reading<strong>{recent.title}</strong>
                  </span>
                  <span>
                    {Math.round((recent.position?.fraction ?? 0) * 100)}%
                    <ArrowRight />
                  </span>
                </button>
              )}
            <div className="shelf-toolbar">
              <div className="shelf-label">
                {(group || hiddenBooks) && (
                  <button
                    className="icon"
                    aria-label={
                      group
                        ? hiddenBooks
                          ? 'Back to hidden books'
                          : 'Back to all books'
                        : 'Back to library'
                    }
                    onClick={() => {
                      if (group) goGroup(null);
                      else setHiddenBooks(false);
                    }}
                  >
                    <ArrowLeft />
                  </button>
                )}
                <h1>
                  {group ??
                    (hiddenBooks
                      ? 'Hidden books'
                      : reading
                        ? 'Currently reading'
                        : 'All books')}
                </h1>
                <span className="muted">
                  {entries.reduce((n, e) => n + e.books.length, 0)}
                </span>
              </div>
            </div>
            {group && seriesBooks.length > 0 && (
              <div className="series-actions">
                <span className="muted">
                  {
                    seriesBooks.filter((b) => readingStatus(b) === 'finished')
                      .length
                  }{' '}
                  of {seriesBooks.length} finished
                </span>
                {seriesNext && (
                  <button onClick={() => void openBook(seriesNext)}>
                    <BookOpen />
                    Continue
                  </button>
                )}
                {(hostedWeb || isTauri()) && (
                  <TrackingButton
                    bookId=""
                    series={group}
                    onClick={() => goTracking(seriesBooks[0], group)}
                  />
                )}
                <button
                  aria-label="Series actions"
                  aria-haspopup="menu"
                  onClick={(e) =>
                    showActions(
                      {
                        key: group,
                        title: group,
                        series: true,
                        books: seriesBooks,
                      },
                      false,
                      e.currentTarget.getBoundingClientRect(),
                    )
                  }
                >
                  <Ellipsis />
                </button>
              </div>
            )}
            <div className="shelf-controls">
              {serverLibraries.length > 0 && (
                <select
                  aria-label="Library collection"
                  value={libraryScope}
                  onChange={(e) => changeFilter('collection', e.target.value)}
                >
                  <option value="all">All libraries</option>
                  <option value="personal">Personal</option>
                  {serverLibraries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              <LibraryControls
                onHidden={
                  hiddenBooks
                    ? undefined
                    : () => {
                        void privacy.authenticate().then((ok) => {
                          if (ok) {
                            goLibrary(false);
                            setHiddenBooks(true);
                            setGroup(null);
                            setQuery('');
                          }
                        });
                      }
                }
                collections={serverLibraries}
                collection={libraryScope}
                preferences={shelfPreferences}
                onChange={(p) => {
                  if (group && p.sort !== seriesSort)
                    changeFilter('sort', p.sort);
                  changePreferences({
                    ...p,
                    sort: group ? preferences.sort : p.sort,
                  });
                }}
                series={!!group}
                status={status}
                availability={availability}
                onFilter={changeFilter}
                selecting={selecting}
                onSelect={() => {
                  setSelecting(!selecting);
                  setSelected([]);
                }}
              />
            </div>
            {(status !== 'all' ||
              availability !== 'all' ||
              libraryScope !== 'all') && (
              <div className="filter-chips">
                {libraryScope !== 'all' && (
                  <button onClick={() => changeFilter('collection', 'all')}>
                    {libraryScope === 'personal'
                      ? 'Personal'
                      : (serverLibraries.find((l) => l.id === libraryScope)
                          ?.name ?? 'Library')}
                    <X />
                  </button>
                )}
                {status !== 'all' && (
                  <button onClick={() => changeFilter('status', 'all')}>
                    {status}
                    <X />
                  </button>
                )}
                {availability !== 'all' && (
                  <button onClick={() => changeFilter('availability', 'all')}>
                    {availability === 'cloud' ? 'Not downloaded' : 'Downloaded'}
                    <X />
                  </button>
                )}
              </div>
            )}
            {selecting && (
              <div
                className="selection-bar"
                role="region"
                aria-label="Selected books"
              >
                <strong>{activeIds.length} selected</strong>
                <PrivacyMenu ids={activeIds} onDone={() => setSelected([])} />
                <button
                  onClick={() =>
                    setSelected(
                      activeIds.length === visibleIds.length ? [] : visibleIds,
                    )
                  }
                >
                  {activeIds.length === visibleIds.length
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
                <button
                  disabled={!activeIds.length || !!busy}
                  onClick={() => void batch(activeIds, 'download')}
                >
                  <Download />
                  Download
                </button>
                <button
                  disabled={!activeIds.length || !!busy}
                  onClick={() => void batch(activeIds, 'finished')}
                >
                  <Check />
                  Mark finished
                </button>
                <button
                  disabled={!activeIds.length || !!busy}
                  onClick={() => void batch(activeIds, 'unread')}
                >
                  <BookOpen />
                  Mark unread
                </button>
                <button
                  className="danger"
                  disabled={!activeIds.length || !!busy}
                  onClick={() => {
                    void (async () => {
                      if (
                        activeIds.every((id) => privacy.access(id)) ||
                        (await privacy.authenticate())
                      )
                        setBulkRemove(true);
                    })();
                  }}
                >
                  <Trash2 />
                  Remove
                </button>
              </div>
            )}

            {loading ? (
              <div className="empty">
                <LoaderCircle className="spin" />
                <p>Loading library</p>
              </div>
            ) : !entries.length ? (
              <div className="empty">
                <BookOpen />
                <h2>
                  {query || status !== 'all' || availability !== 'all'
                    ? 'No books found'
                    : hiddenBooks
                      ? 'No hidden books'
                      : reading
                        ? 'No books in progress'
                        : 'No books yet'}
                </h2>
                <p>
                  {query || status !== 'all' || availability !== 'all'
                    ? 'Try another search or adjust your filters.'
                    : hiddenBooks
                      ? 'Books you hide will appear here.'
                      : reading
                        ? 'Open a book from your library to start reading.'
                        : onImport
                          ? 'Upload an EPUB to your personal server library.'
                          : 'Add an EPUB to start reading.'}
                </p>
                <button
                  className="primary"
                  onClick={
                    query
                      ? () => changeFilter('q', '')
                      : status !== 'all' || availability !== 'all'
                        ? () => {
                            changeFilter('status', 'all');
                            changeFilter('availability', 'all');
                          }
                        : hiddenBooks
                          ? () => setHiddenBooks(false)
                          : reading
                            ? () => goLibrary()
                            : () => input.current?.click()
                  }
                >
                  {query
                    ? 'Clear search'
                    : status !== 'all' || availability !== 'all'
                      ? 'Clear filters'
                      : hiddenBooks
                        ? 'Back to library'
                        : reading
                          ? 'Browse library'
                          : 'Add books'}
                </button>
              </div>
            ) : (
              <div
                className={`books ${preferences.view} ${group ? 'series-volumes' : ''}`}
              >
                {entries.map((entry) => {
                  const book = entry.books[0];
                  return (
                    <article
                      className={`book ${selecting ? 'selectable' : ''}`}
                      key={entry.key}
                    >
                      {selecting && (
                        <button
                          className="book-selection"
                          role="checkbox"
                          aria-checked={entry.books.every((b) =>
                            activeIds.includes(b.id),
                          )}
                          aria-label={`Select ${entry.title}, ${entry.books.length} books`}
                          onClick={() => toggleEntry(entry)}
                        >
                          {entry.books.every((b) =>
                            activeIds.includes(b.id),
                          ) ? (
                            <CheckSquare />
                          ) : (
                            <span className="unchecked-square" />
                          )}
                        </button>
                      )}
                      <BookOpenButton
                        href={
                          hostedWeb && !selecting
                            ? entry.series
                              ? '/series/' + encodeURIComponent(book.series)
                              : '/books/' + book.id + '/read'
                            : undefined
                        }
                        onActions={(anchor) =>
                          showActions(entry, false, anchor)
                        }
                        onOpen={() =>
                          selecting
                            ? toggleEntry(entry)
                            : entry.series
                              ? goGroup(book.series)
                              : void openBook(book)
                        }
                        label={
                          entry.series
                            ? `Open series ${entry.title}`
                            : `Open ${entry.title}`
                        }
                      >
                        <Cover entry={entry} />
                        <div className="book-copy">
                          <h2 title={entry.title}>
                            {group && book.volume !== null
                              ? `Volume ${book.volume}`
                              : entry.title}
                          </h2>
                          <p className="book-author">
                            {group
                              ? readingStatus(book) === 'finished'
                                ? 'Finished'
                                : readingStatus(book) === 'reading'
                                  ? `${Math.round(book.position!.fraction * 100)}% read`
                                  : 'Unread'
                              : book.author}
                          </p>
                        </div>
                      </BookOpenButton>
                      <div className="book-under">
                        <span>
                          {group
                            ? ''
                            : entry.series
                              ? `${entry.books.length} volumes`
                              : book.volume !== null
                                ? `Volume ${book.volume}`
                                : book.position
                                  ? `${Math.round(book.position.fraction * 100)}%`
                                  : 'Not started'}
                        </span>
                        <div className="book-tail">
                          {entry.books.some(
                            (b) =>
                              (privacy.state.books[b.id] ?? 'normal') !==
                              'normal',
                          ) && (
                            <span
                              className="icon"
                              title="Private book"
                              aria-label="Private book"
                            >
                              <LockKeyhole size={16} />
                            </span>
                          )}
                          {!group &&
                            !entry.series &&
                            book.volume !== null &&
                            book.position && (
                              <span>
                                {Math.round(book.position.fraction * 100)}%
                              </span>
                            )}
                          {!entry.series && !book.local && (
                            <span
                              className="unavailable"
                              aria-label="Not downloaded"
                              title="Downloads when you open the book"
                            >
                              <CloudDownload aria-hidden="true" />
                            </span>
                          )}
                          <button
                            className="icon"
                            aria-label={`Actions for ${entry.title}`}
                            aria-haspopup="menu"
                            onClick={(e) =>
                              showActions(
                                entry,
                                false,
                                e.currentTarget.getBoundingClientRect(),
                              )
                            }
                          >
                            <Ellipsis />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}
      {busy && (
        <div className="activity" role="status">
          <LoaderCircle className="spin" />
          {busy}
        </div>
      )}
      {notice && !busy && (
        <div className="notice" role="status">
          <Check />
          {notice}
          <button
            className="icon"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X />
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X />
          </button>
        </div>
      )}
      {settings && (
        <Settings
          activeTab={hostedWeb ? route.tab : undefined}
          onTabChange={
            hostedWeb
              ? (tab) => navigateWeb('/settings/' + tab, true)
              : undefined
          }
          books={privacy.unlocked ? books : shelfBooks}
          backupActions={{
            prepare: prepareBackup,
            restore: restoreBackup,
            exported: markExported,
          }}
          preferences={preferences}
          onChange={changePreferences}
          onClose={() => goSettings(false)}
        />
      )}
      {seriesTracking &&
        shelfBooks.find(
          (b) => b.series === seriesTracking && privacy.access(b.id),
        ) && (
          <TrackingDialog
            book={shelfBooks.find(
              (b) => b.series === seriesTracking && privacy.access(b.id),
            )!}
            series={seriesTracking}
            onClose={() =>
              hostedWeb
                ? closeWeb('/series/' + encodeURIComponent(seriesTracking))
                : setSeriesTracking(null)
            }
          />
        )}
      {bookTracking &&
        privacy.access(bookTracking) &&
        books.find((b) => b.id === bookTracking) && (
          <TrackingDialog
            book={books.find((b) => b.id === bookTracking)!}
            onClose={() =>
              hostedWeb
                ? closeWeb('/books/' + bookTracking)
                : setBookTracking(null)
            }
          />
        )}
      {hostedWeb &&
        (route.kind === 'not-found' ||
          (!loading && route.bookId && !routeBookExists)) && (
          <div className="route-notice" role="status">
            <h2>
              {route.kind === 'not-found'
                ? 'Page not found'
                : 'Book unavailable'}
            </h2>
            {route.kind !== 'not-found' && (
              <p>This book is not in your library, or is still syncing.</p>
            )}
            <button onClick={() => navigateWeb('/library')}>
              Back to library
            </button>
          </div>
        )}
      {bulkRemove && (
        <Modal
          title={`Remove ${activeIds.length} books?`}
          onClose={() => setBulkRemove(false)}
        >
          <p>
            This deletes their downloads, progress, bookmarks, highlights, and
            notes from Quire. Original EPUB files and exported backups are kept.
          </p>
          <div className="button-row">
            <button onClick={() => setBulkRemove(false)}>Cancel</button>
            <button
              className="danger"
              disabled={!!busy || !activeIds.length}
              onClick={() => {
                setBusy('Removing books…');
                void removeFromLibrary(activeIds)
                  .then(() => {
                    setBulkRemove(false);
                    setSelected([]);
                  })
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(''));
              }}
            >
              Remove {activeIds.length} books
            </button>
          </div>
        </Modal>
      )}
      {actions && actions.entry.books.every((b) => privacy.access(b.id)) && (
        <BookActions
          onDownload={() =>
            batch(
              actions.entry.books.map((b) => b.id),
              'download',
            )
          }
          onMark={(finished) =>
            batch(
              actions.entry.books.map((b) => b.id),
              finished ? 'finished' : 'unread',
            )
          }
          onContinue={
            actions.entry.series &&
            actions.entry.books.some((b) => readingStatus(b) !== 'finished')
              ? () => {
                  const next =
                    continueBook(actions.entry.books) ??
                    actions.entry.books.find(
                      (b) => readingStatus(b) === 'unread',
                    );
                  if (next) {
                    setActions(null);
                    void openBook(next);
                  }
                }
              : undefined
          }
          onTracking={
            hostedWeb || isTauri()
              ? () => {
                  goTracking(
                    actions.entry.books[0],
                    actions.entry.series ? actions.entry.title : undefined,
                  );
                  setActions(null);
                }
              : undefined
          }
          anchor={actions.anchor}
          entry={actions.entry}
          initialRemove={actions.initialRemove}
          onClose={() => setActions(null)}
          onOpen={() => {
            const entry = actions.entry;
            setActions(null);
            if (entry.series) goGroup(entry.books[0].series);
            else void openBook(entry.books[0]);
          }}
          onDetails={() => {
            goDetails(actions.entry.books[0].id);
            setActions(null);
          }}
          onRemoveDownload={() =>
            batch(
              actions.entry.books.map((b) => b.id),
              'remove-download',
            )
          }
          onDelete={() =>
            removeFromLibrary(actions.entry.books.map((b) => b.id))
          }
        />
      )}
      {details && (
        <BookDetails
          onTracking={
            hostedWeb || isTauri() ? () => goTracking(details) : undefined
          }
          onDelete={() => {
            setDetailsId(null);
            showActions(
              {
                key: details.id,
                title: details.title,
                series: false,
                books: [details],
              },
              true,
            );
          }}
          key={details.id}
          book={details}
          onClose={() => goDetails(null)}
          onRead={() => void openBook(details)}
          onImport={() => {
            setDetailsId(null);
            input.current?.click();
          }}
          onSave={(draft) =>
            enqueue(async () => {
              const latest = booksRef.current.find((b) => b.id === draft.id)!;
              const next = {
                ...latest,
                title: draft.title,
                author: draft.author,
                series: draft.series,
                volume: draft.volume,
              };
              await saveBook(next);
              replace(next);
            })
          }
          onRemove={() =>
            enqueue(async () => {
              await removeFile(details.id);
              replace({
                ...booksRef.current.find((b) => b.id === details.id)!,
                local: false,
              });
            })
          }
        />
      )}
    </>
  );
}
export function App(props: Parameters<typeof AppContent>[0]) {
  return (
    <PrivacyProvider>
      <AppContent {...props} />
    </PrivacyProvider>
  );
}
