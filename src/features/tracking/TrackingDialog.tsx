import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  ChevronDown,
  Check,
  ExternalLink,
  Link2,
  LoaderCircle,
  Search,
  Unlink,
  RefreshCw,
} from 'lucide-react';
import { ServerSettings } from '../sync/ServerSettings';
import { requestNavigation } from '../navigation/blockers';
import { Modal } from '../../components/Modal';
import { Switch } from '../../components/Controls';
import { useDraftGuard } from '../../components/useDraftGuard';
import { TaskError } from '../../components/TaskError';
import type { Book } from '../../domain/models';
import { inferSeriesVolume } from '../../domain/book-structure';
import { isTauri } from '@tauri-apps/api/core';
import {
  trackingSession,
  trackingRequest,
  connectTracking,
  type TrackingSession,
} from './client';

import { syncNow } from '../sync/engine';
import { TrackerEntryPanel } from './TrackerEntryPanel';
import { rankMatches } from './matching';
import {
  progressMode,
  trackingVolume,
  type ProgressMode,
} from './progressMode';
import './tracking.css';

type Match = {
  id: number;
  title: string;
  author: string;
  type: string;
  status: string;
  description: string;
  cover: string;
  sources: string[];
  alternateTitles?: string[];
};
type Link = {
  bookId: string;
  seriesId: number;
  seriesKey: string;
  title: string;
  volume: number;
  auto: boolean;
  completeEntry: boolean;
  lastStep: number;
  lastSync: number;
  error: string;
  private?: boolean;
};
type Tracking = {
  error?: string;
  pending?: boolean;
  accountId?: string;
  oauthAvailable: boolean;
  connected: boolean;
  name: string;
  links: Link[];
};
const matchFor = (link: Link): Match => ({
  id: link.seriesId,
  title: link.title,
  author: '',
  type: '',
  status: '',
  description: '',
  cover: '',
  sources: [],
});

export function TrackingDialog({
  book,
  series,
  onClose,
}: {
  book: Book;
  series?: string;
  onClose(): void;
}) {
  const [connectingServer, setConnectingServer] = useState(false);
  const [needsServer, setNeedsServer] = useState(false);
  const title = series || book.title;
  const inferredVolume = inferSeriesVolume(book.title, '', book).volume ?? 0;
  const [account, setAccount] = useState<TrackingSession>(),
    [state, setState] = useState<Tracking>(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true),
    [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<ProgressMode>(progressMode(inferredVolume));
  const [draftChanged, setDraftChanged] = useState(false);
  const [entryGuard, setEntryGuard] = useState({ dirty: false, busy: false });
  const updateEntryGuard = useCallback(
    (dirty: boolean, busy: boolean) => setEntryGuard({ dirty, busy }),
    [],
  );
  const generation = useRef(0),
    searchGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const statusController = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const modeInput = useRef<HTMLSelectElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false),
    [editAccountId, setEditAccountId] = useState(''),
    [query, setQuery] = useState(title),
    [results, setResults] = useState<Match[]>([]),
    [searched, setSearched] = useState(false),
    [selected, setSelected] = useState<Match>();
  const [scope, setScope] = useState<'book' | 'series'>(
      series ? 'series' : 'book',
    ),
    [volume, setVolume] = useState(inferredVolume),
    [automatic, setAutomatic] = useState(false),
    [complete, setComplete] = useState(inferredVolume > 0),
    [unlink, setUnlink] = useState(false);
  const [privateEntry, setPrivateEntry] = useState(true);
  const [entryRefresh, setEntryRefresh] = useState(0);
  const seriesLinks =
    state?.links.filter(
      (l) => l.seriesKey === (series || book.series) && l.seriesKey !== '',
    ) ?? [];
  const link = series
    ? seriesLinks[0]
    : state?.links.find((l) => l.bookId === book.id);
  const seriesLink = seriesLinks.find((l) => l.bookId !== book.id);
  const linkedAuto = series
    ? seriesLinks.length > 0 && seriesLinks.every((l) => l.auto)
    : !!link?.auto;
  const guard = useDraftGuard({
    dirty: draftChanged || entryGuard.dirty || !!busy || entryGuard.busy,
    busy: !!busy || entryGuard.busy,
  });
  function invalidateSearch() {
    searchGeneration.current++;
    searchController.current?.abort();
    setSearching(false);
  }
  function close() {
    if (mutating.current || entryGuard.busy) return;
    guard.requestLeave(() => {
      generation.current++;
      invalidateSearch();
      statusController.current?.abort();
      onClose();
    });
  }
  const currentAccountId = useRef<string | undefined>(undefined);
  function acceptState(data: Tracking) {
    if (
      currentAccountId.current !== undefined &&
      currentAccountId.current !== (data.accountId ?? '')
    ) {
      invalidateSearch();
      setEditing(false);
      setSelected(undefined);
      setResults([]);
      setDraftChanged(false);
      setAutomatic(false);
    }
    currentAccountId.current = data.accountId ?? '';
    setState(data);
  }
  async function refresh(a = account) {
    if (a) {
      const requestGeneration = generation.current;
      statusController.current?.abort();
      const controller = new AbortController();
      statusController.current = controller;
      const data = await trackingRequest(
        a,
        '/v1/tracking',
        undefined,
        undefined,
        { signal: controller.signal },
      );
      if (requestGeneration === generation.current) {
        acceptState(data);
        setEntryRefresh((n) => n + 1);
      }
    }
  }
  useEffect(() => {
    let alive = true;
    let sessionKey: string | undefined;
    let latestLoad = 0;
    const keyFor = (s: TrackingSession) =>
      s.kind === 'native' ? 'native' : JSON.stringify(s.account);
    const load = async () => {
      const loadId = ++latestLoad;
      const checkGeneration = generation.current;
      try {
        const session = await trackingSession();
        if (alive && loadId === latestLoad) setNeedsServer(false);
        if (
          !alive ||
          loadId !== latestLoad ||
          checkGeneration !== generation.current
        )
          return;
        const key = keyFor(session);
        if (key === sessionKey) return;
        sessionKey = key;
        const requestGeneration = ++generation.current;
        invalidateSearch();
        statusController.current?.abort();
        const controller = new AbortController();
        statusController.current = controller;
        setLoading(true);
        setState(undefined);
        setAccount(undefined);
        setEditing(false);
        setDraftChanged(false);
        setSelected(undefined);
        setResults([]);
        const data = await trackingRequest(
          session,
          '/v1/tracking',
          undefined,
          undefined,
          { signal: controller.signal },
        );
        if (
          session.kind === 'hosted' &&
          keyFor(await trackingSession()) !== key
        ) {
          if (alive && requestGeneration === generation.current) {
            sessionKey = undefined;
            void load();
          }
          return;
        }
        if (alive && requestGeneration === generation.current) {
          setAccount(session);
          acceptState(data);
          setLoading(false);
          setError('');
        }
      } catch (e) {
        if (alive && loadId === latestLoad) {
          generation.current++;
          invalidateSearch();
          statusController.current?.abort();
          sessionKey = undefined;
          setState(undefined);
          setAccount(undefined);
          setEditing(false);
          setSelected(undefined);
          setResults([]);
          setDraftChanged(false);
          setNeedsServer(
            !!e &&
              typeof e === 'object' &&
              'code' in e &&
              e.code === 'SERVER_CONNECTION_REQUIRED',
          );
          setError(e instanceof Error ? e.message : 'Could not load tracking.');
          setLoading(false);
        }
      }
    };
    void load();
    window.addEventListener('quire-storage', load);
    return () => {
      alive = false;
      generation.current++;
      searchGeneration.current++;
      searchController.current?.abort();
      statusController.current?.abort();
      window.removeEventListener('quire-storage', load);
    };
  }, [book.id, series]);
  useEffect(() => {
    if (!account || account.kind !== 'native') return;
    let alive = true;
    let reading = false;
    let controller: AbortController | undefined;
    const update = () => {
      if (document.hidden || reading || mutating.current) return;
      reading = true;
      const requestGeneration = generation.current;
      controller = new AbortController();
      void trackingRequest(account, '/v1/tracking', undefined, undefined, {
        signal: controller.signal,
      })
        .then((data) => {
          if (alive && requestGeneration === generation.current)
            acceptState(data);
        })
        .catch((e) => {
          if (alive && requestGeneration === generation.current)
            setError(String(e));
        })
        .finally(() => {
          reading = false;
        });
    };
    const timer = setInterval(update, 2000);
    document.addEventListener('visibilitychange', update);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [account]);
  async function run(
    label: string,
    fn: (current: () => boolean) => Promise<void>,
  ) {
    if (mutating.current) return;
    mutating.current = true;
    const requestGeneration = generation.current;
    setBusy(label);
    setError('');
    try {
      await fn(() => requestGeneration === generation.current);
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(
          e instanceof Error ? e.message : 'Tracking could not be updated.',
        );
    } finally {
      mutating.current = false;
      setBusy('');
    }
  }
  function edit() {
    invalidateSearch();
    setDraftChanged(false);
    setEditing(true);
    setEditAccountId(state?.accountId ?? '');
    setPrivateEntry(link?.private ?? true);
    setSelected(link ? matchFor(link) : undefined);
    setResults([]);
    setSearched(false);
    setScope(series || link?.seriesKey ? 'series' : 'book');
    setVolume(link?.volume ?? inferredVolume);
    setMode(progressMode(link?.volume ?? inferredVolume));
    setAutomatic(linkedAuto);
    setComplete(link?.completeEntry ?? inferredVolume > 0);
    setQuery(title);
    if (!link) void search(title);
  }
  async function search(value = query) {
    if (!account || !value.trim() || mutating.current) return;
    invalidateSearch();
    const requestGeneration = searchGeneration.current;
    const accountGeneration = generation.current;
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setError('');
    setSearched(false);
    setResults([]);
    setSelected(undefined);
    try {
      const data = await trackingRequest(
        account,
        '/v1/tracking/search?q=' + encodeURIComponent(value.trim()),
        undefined,
        undefined,
        { signal: controller.signal },
      );
      if (
        requestGeneration !== searchGeneration.current ||
        accountGeneration !== generation.current
      )
        return;
      setResults(rankMatches(data.matches, value, book.format));
      setSearched(true);
    } catch (e) {
      if (
        requestGeneration === searchGeneration.current &&
        accountGeneration === generation.current
      )
        setError(
          e instanceof Error ? e.message : 'Could not search MangaBaka.',
        );
    } finally {
      if (requestGeneration === searchGeneration.current) setSearching(false);
    }
  }
  function selectScope(value: 'book' | 'series') {
    invalidateSearch();
    setDraftChanged(true);
    setScope(value);
    setSelected(
      value === 'series' && seriesLink ? matchFor(seriesLink) : undefined,
    );
    const saved =
      link && (link.seriesKey ? 'series' : 'book') === value ? link : undefined;
    setVolume(saved?.volume ?? inferredVolume);
    setMode(progressMode(saved?.volume ?? inferredVolume));
    setComplete(
      value === 'book' && (saved?.completeEntry ?? inferredVolume > 0),
    );
    setResults([]);
    setSearched(false);
    setQuery(value === 'series' ? book.series : book.title);
  }
  async function connect() {
    if (!account) return;
    await run('Opening MangaBaka', async (current) => {
      await connectTracking(account);
      if (current() && account.kind === 'native') await refresh();
    });
  }
  async function save() {
    if (!account || !selected) return;
    await run('Saving', async (current) => {
      if (!isTauri()) await syncNow();
      if (!current()) return;
      if (series)
        await trackingRequest(
          account,
          '/v1/tracking/series',
          {
            seriesKey: series,
            seriesId: selected.id,
            title: selected.title,
            auto: automatic && !!state?.connected,
            ...(!link || link.seriesId !== selected.id
              ? { private: privateEntry }
              : {}),
            ...(account.kind === 'native'
              ? { expectedAccountId: editAccountId }
              : {}),
          },
          'PUT',
        );
      else
        await trackingRequest(
          account,
          `/v1/tracking/books/${book.id}`,
          {
            bookId: book.id,
            seriesId: selected.id,
            title: selected.title,
            seriesKey: scope === 'series' ? book.series : '',
            volume: trackingVolume(mode, volume),
            auto: automatic && !!state?.connected,
            ...(!link || link.seriesId !== selected.id
              ? { private: privateEntry }
              : {}),
            ...(account.kind === 'native'
              ? { expectedAccountId: editAccountId }
              : {}),
            completeEntry: scope === 'book' && complete,
          },
          'PUT',
        );
      if (!current()) return;
      if (state?.connected && (!link || link.seriesId !== selected.id))
        await trackingRequest(
          account,
          `/v1/tracking/entries/${selected.id}`,
          { expectedAccountId: editAccountId, is_private: privateEntry },
          'POST',
        );
      if (!current()) return;
      setEditing(false);
      setDraftChanged(false);
      await refresh();
      if (current() && automatic) {
        await trackingRequest(account, '/v1/tracking/sync', {}, 'POST');
        if (current()) await refresh();
      }
    });
  }
  async function remove() {
    await run('Unlinking', async (current) => {
      if (series)
        await trackingRequest(
          account!,
          '/v1/tracking/series',
          { seriesKey: series },
          'DELETE',
        );
      else
        await trackingRequest(
          account!,
          `/v1/tracking/books/${book.id}`,
          undefined,
          'DELETE',
        );
      if (!current()) return;
      setUnlink(false);
      await refresh();
    });
  }
  if (connectingServer)
    return (
      <Modal
        title="Connect server"
        onClose={() => requestNavigation(() => setConnectingServer(false))}
      >
        <button
          type="button"
          onClick={() => requestNavigation(() => setConnectingServer(false))}
        >
          <ArrowLeft size={16} /> Back to tracking
        </button>
        <ServerSettings books={[book]} />
      </Modal>
    );
  return (
    <Modal
      title={series ? 'Series tracking' : 'Tracking'}
      onClose={close}
      initialFocus={selected ? (series ? saveButton : modeInput) : searchInput}
      focusKey={editing ? (selected ? 'mapping' : 'search') : 'summary'}
    >
      <div className="tracker-body">
        <p className="tracker-context">{title}</p>
        {(error || state?.error) && (
          <TaskError summary={error || state?.error || ''} detail="" />
        )}
        {needsServer &&
          !isTauri() &&
          import.meta.env.VITE_HOSTED !== 'true' && (
            <button
              className="primary"
              onClick={() => setConnectingServer(true)}
            >
              <Cloud size={16} /> Connect server
            </button>
          )}
        {(busy || loading || searching) && (
          <p className="tracker-status" role="status">
            <LoaderCircle className="spinning" />
            {busy || (loading ? 'Loading' : 'Searching')}…
          </p>
        )}
        {state?.pending && !busy && (
          <p role="status" className="muted">
            Finish signing in to MangaBaka in your browser.
          </p>
        )}
        {state && !editing && (
          <>
            <section className="tracker-card">
              <div className="tracker-card-heading">
                <h3>MangaBaka</h3>
                {link && (
                  <span className="tracker-auto-status">
                    {state.connected && linkedAuto
                      ? 'Auto-track on'
                      : 'Auto-track off'}
                  </span>
                )}
              </div>
              {link ? (
                <>
                  <a
                    className="tracker-link"
                    href={`https://mangabaka.org/${link.seriesId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{link.title}</span>
                    <ExternalLink size={16} />
                  </a>
                  {(series || link.seriesKey) && (
                    <p className="muted tracker-scope-label">
                      {series
                        ? `${seriesLinks.length} ${seriesLinks.length === 1 ? 'book' : 'books'} linked`
                        : link.seriesKey
                          ? 'Using series match'
                          : 'Book match'}
                    </p>
                  )}
                  {link.error && (
                    <p role="alert" className="error">
                      {link.error}
                    </p>
                  )}
                  {state.connected && account && (
                    <TrackerEntryPanel
                      key={`${link.seriesId}:${state.accountId}`}
                      account={account}
                      seriesId={link.seriesId}
                      refreshKey={entryRefresh}
                      onGuardChange={updateEntryGuard}
                      onRequestLeave={guard.requestLeave}
                    />
                  )}
                  <div className="tracker-actions tracker-primary-actions">
                    <button
                      disabled={!!busy || entryGuard.busy}
                      onClick={() => guard.requestLeave(edit)}
                    >
                      <Link2 />
                      Change match
                    </button>
                    {state.connected && linkedAuto && (
                      <button
                        disabled={!!busy || entryGuard.busy}
                        onClick={() =>
                          void run('Updating', async (current) => {
                            if (!isTauri()) await syncNow();
                            if (!current()) return;
                            await trackingRequest(
                              account!,
                              '/v1/tracking/sync',
                              {},
                              'POST',
                            );
                            if (current()) await refresh();
                          })
                        }
                      >
                        <RefreshCw />
                        Send reading progress
                      </button>
                    )}
                    <button
                      className="icon"
                      title="Unlink tracker"
                      aria-label="Unlink tracker"
                      disabled={!!busy || entryGuard.busy}
                      onClick={() => guard.requestLeave(() => setUnlink(true))}
                    >
                      <Unlink />
                    </button>
                  </div>
                  {unlink && (
                    <div className="tracker-confirm">
                      <p>
                        {series
                          ? 'Unlink the series? Individual book matches will stay.'
                          : 'Unlink this book? Your MangaBaka entry will stay.'}
                      </p>
                      <div className="tracker-actions">
                        <button
                          disabled={!!busy}
                          onClick={() => setUnlink(false)}
                        >
                          Cancel
                        </button>
                        <button
                          disabled={!!busy || entryGuard.busy}
                          onClick={() => void remove()}
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button className="primary" disabled={!!busy} onClick={edit}>
                  <Link2 />
                  {series ? 'Track series' : 'Add tracker'}
                </button>
              )}
            </section>
            {state.connected ? (
              <details className="tracker-account">
                <summary>
                  <span>
                    Account <strong>{state.name}</strong>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <div className="tracker-actions">
                  {state.oauthAvailable && (
                    <button
                      disabled={!!busy || entryGuard.busy}
                      onClick={() => guard.requestLeave(() => void connect())}
                    >
                      <RefreshCw />
                      Reconnect
                    </button>
                  )}
                  <button
                    disabled={!!busy || entryGuard.busy}
                    onClick={() =>
                      guard.requestLeave(
                        () =>
                          void run('Disconnecting', async (current) => {
                            await trackingRequest(
                              account!,
                              '/v1/tracking/account',
                              undefined,
                              'DELETE',
                            );
                            if (current()) await refresh();
                          }),
                      )
                    }
                  >
                    <Unlink />
                    Disconnect
                  </button>
                </div>
              </details>
            ) : (
              <div className="tracker-account">
                <p className="muted">
                  Connect MangaBaka to sync your progress.
                </p>
                {state.oauthAvailable ? (
                  <button disabled={!!busy} onClick={() => void connect()}>
                    <ExternalLink />
                    Connect MangaBaka
                  </button>
                ) : (
                  <p className="muted">
                    MangaBaka sign-in must be configured by your server
                    administrator. You can still save a match.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {state && editing && (
          <>
            {!series && book.series && (
              <fieldset className="tracker-scope">
                <legend>Match</legend>
                <label>
                  <input
                    type="radio"
                    name="tracking-scope"
                    disabled={!!busy}
                    checked={scope === 'book'}
                    onChange={() => selectScope('book')}
                  />
                  This book
                </label>
                <label>
                  <input
                    type="radio"
                    name="tracking-scope"
                    disabled={!!busy}
                    checked={scope === 'series'}
                    onChange={() => selectScope('series')}
                  />
                  Series match
                </label>
              </fieldset>
            )}
            {!selected && !(scope === 'series' && seriesLink && !series) && (
              <form
                className="tracker-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label>
                  Search MangaBaka
                  <input
                    maxLength={300}
                    disabled={!!busy}
                    value={query}
                    ref={searchInput}
                    placeholder="Title or MangaBaka link"
                    onChange={(e) => {
                      invalidateSearch();
                      setResults([]);
                      setSearched(false);
                      setQuery(e.target.value);
                    }}
                  />
                </label>
                <button disabled={!!busy || searching || !query.trim()}>
                  <Search />
                  Search
                </button>
              </form>
            )}
            {selected ? (
              <article className="tracker-match">
                <div className="tracker-match-main">
                  {selected.cover && (
                    <img
                      src={selected.cover}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <span className="tracker-provider">MangaBaka</span>
                    <h3>{selected.title}</h3>
                    {(selected.type || selected.author) && (
                      <p className="muted">
                        {[
                          selected.type
                            ? selected.type.charAt(0).toUpperCase() +
                              selected.type.slice(1)
                            : '',
                          selected.author,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <a
                    className="icon"
                    aria-label="Open MangaBaka entry"
                    href={`https://mangabaka.org/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
                {!(scope === 'series' && seriesLink && !series) && (
                  <button
                    className="tracker-change"
                    disabled={!!busy}
                    onClick={() => {
                      invalidateSearch();
                      setSelected(undefined);
                      setResults([]);
                      setSearched(false);
                    }}
                  >
                    <Search size={16} />
                    Change match
                  </button>
                )}
              </article>
            ) : (
              <div className="tracker-results">
                {results.map((match) => (
                  <button
                    type="button"
                    key={match.id}
                    className="tracker-result"
                    disabled={!!busy}
                    onClick={() => {
                      invalidateSearch();
                      setSelected(match);
                      setDraftChanged(true);
                    }}
                  >
                    {match.cover && (
                      <img
                        src={match.cover}
                        alt=""
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    )}
                    <span>
                      <strong>{match.title}</strong>
                      <span className="muted">
                        {[match.type, match.author].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searched && !selected && results.length === 0 && (
              <p>No matches. Try another title or paste a MangaBaka link.</p>
            )}
            {selected && (
              <>
                <div className="tracker-preferences">
                  {!series && (
                    <div className="tracker-mapping">
                      <label>
                        Progress mode
                        <select
                          ref={modeInput}
                          value={mode}
                          disabled={!!busy}
                          onChange={(e) => {
                            setMode(e.target.value as ProgressMode);
                            setDraftChanged(true);
                          }}
                        >
                          <option value="chapters">Chapters</option>
                          <option value="volumes">Volumes</option>
                        </select>
                      </label>
                      {mode === 'volumes' && (
                        <label>
                          Volume on completion
                          <input
                            type="number"
                            min={0.01}
                            max={10000}
                            step="any"
                            disabled={!!busy}
                            value={volume}
                            onChange={(e) => {
                              setVolume(Number(e.target.value));
                              setDraftChanged(true);
                            }}
                          />
                        </label>
                      )}
                      <p className="muted tracker-hint">
                        {mode === 'chapters'
                          ? 'Sync completed chapters.'
                          : `Mapped to volume ${volume || '—'} on completion.`}
                      </p>
                    </div>
                  )}
                  <fieldset disabled={!!busy || !state.connected}>
                    <Switch
                      label="Automatically sync progress"
                      checked={automatic && state.connected}
                      onChange={(value) => {
                        setAutomatic(value);
                        setDraftChanged(true);
                      }}
                    />
                  </fieldset>
                  {(!link || selected.id !== link.seriesId) && (
                    <fieldset disabled={!!busy}>
                      <Switch
                        label="Track privately on MangaBaka"
                        checked={privateEntry}
                        onChange={(value) => {
                          setPrivateEntry(value);
                          setDraftChanged(true);
                        }}
                      />
                    </fieldset>
                  )}
                  {!state.connected && (
                    <div className="tracker-connect-row">
                      <span className="muted">
                        {state.oauthAvailable
                          ? 'Connect to enable syncing.'
                          : 'MangaBaka sign-in is not configured on this server. You can save this match.'}
                      </span>
                      <button
                        disabled={!!busy || !state.oauthAvailable}
                        onClick={() => void connect()}
                      >
                        <Link2 size={16} />
                        Connect
                      </button>
                    </div>
                  )}
                  <details className="tracker-options">
                    <summary>
                      Progress options
                      <ChevronDown size={16} />
                    </summary>
                    <div className="tracker-option-content">
                      {series ? (
                        <p className="muted">
                          Finished books update their volume number. Individual
                          book matches are kept.
                        </p>
                      ) : (
                        <>
                          {scope === 'book' && (
                            <fieldset disabled={!!busy}>
                              <Switch
                                label="Mark entry completed when finished"
                                checked={complete}
                                onChange={(value) => {
                                  setComplete(value);
                                  setDraftChanged(true);
                                }}
                              />
                            </fieldset>
                          )}
                        </>
                      )}
                    </div>
                  </details>
                </div>
                {(selected.description || selected.sources.length > 0) && (
                  <details className="tracker-about">
                    <summary>
                      About this match
                      <ChevronDown size={16} />
                    </summary>
                    {selected.description && (
                      <p className="tracker-description">
                        {selected.description}
                      </p>
                    )}
                    {selected.sources.length > 0 && (
                      <p className="tracker-attribution">
                        Data from MangaBaka and{' '}
                        {selected.sources
                          .map(
                            (source) =>
                              (
                                ({
                                  anilist: 'AniList',
                                  'anime news network': 'Anime News Network',
                                  'anime planet': 'Anime-Planet',
                                  kitsu: 'Kitsu',
                                  'manga updates': 'MangaUpdates',
                                  'my anime list': 'MyAnimeList',
                                  shikimori: 'Shikimori',
                                }) as Record<string, string>
                              )[source] ?? source,
                          )
                          .join(', ')}
                        .
                      </p>
                    )}
                  </details>
                )}
              </>
            )}
            <div className="tracker-footer">
              <button
                disabled={!!busy}
                onClick={() =>
                  guard.requestLeave(() => {
                    invalidateSearch();
                    setEditing(false);
                    setDraftChanged(false);
                  })
                }
              >
                Cancel
              </button>
              <button
                ref={saveButton}
                className="primary"
                disabled={
                  !!busy ||
                  !selected ||
                  (mode === 'volumes' &&
                    (!Number.isFinite(volume) || volume <= 0 || volume > 10000))
                }
                onClick={() => void save()}
              >
                <Check />
                {!state.connected
                  ? 'Save match'
                  : link
                    ? 'Save'
                    : series
                      ? 'Track series'
                      : 'Track'}
              </button>
            </div>
          </>
        )}
      </div>
      {guard.confirmation}
    </Modal>
  );
}
