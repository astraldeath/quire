import { useEffect, useState } from 'react';
import {
  ChevronDown,
  Check,
  ExternalLink,
  Link2,
  LoaderCircle,
  Search,
  Unlink,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Switch } from '../../components/Controls';
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

type Match = {
  id: number;
  title: string;
  author: string;
  type: string;
  status: string;
  description: string;
  cover: string;
  sources: string[];
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
  const title = series || book.title;
  const inferredVolume = inferSeriesVolume(book.title, '', book).volume ?? 0;
  const [account, setAccount] = useState<TrackingSession>(),
    [state, setState] = useState<Tracking>(),
    [busy, setBusy] = useState('Loading'),
    [error, setError] = useState('');
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
  useEffect(() => {
    if (isTauri()) {
      setAutomatic(false);
      setEditAccountId(state?.accountId ?? '');
    }
  }, [state?.accountId]);
  async function refresh(a = account) {
    if (a) setState(await trackingRequest(a, '/v1/tracking'));
  }
  useEffect(() => {
    let alive = true;
    void trackingSession()
      .then(async (session) => {
        const data = await trackingRequest(session, '/v1/tracking');
        if (alive) {
          setAccount(session);
          setState(data);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy('');
      });
    return () => {
      alive = false;
    };
  }, [book.id, series]);
  useEffect(() => {
    if (!account || account.kind !== 'native') return;
    let alive = true;
    let reading = false;
    const update = () => {
      if (document.hidden || reading) return;
      reading = true;
      void trackingRequest(account, '/v1/tracking')
        .then((data) => {
          if (alive) setState(data);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        })
        .finally(() => {
          reading = false;
        });
    };
    const timer = setInterval(update, 2000);
    document.addEventListener('visibilitychange', update);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [account]);
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Tracking could not be updated.',
      );
    } finally {
      setBusy('');
    }
  }
  function edit() {
    setEditing(true);
    setEditAccountId(state?.accountId ?? '');
    setSelected(link ? matchFor(link) : undefined);
    setResults([]);
    setSearched(false);
    setScope(series || link?.seriesKey ? 'series' : 'book');
    setVolume(link?.volume ?? inferredVolume);
    setAutomatic(linkedAuto);
    setComplete(link?.completeEntry ?? inferredVolume > 0);
    setQuery(title);
  }
  async function search() {
    if (!account) return;
    setSelected(undefined);
    await run('Searching', async () => {
      const data = await trackingRequest(
        account,
        '/v1/tracking/search?q=' + encodeURIComponent(query.trim()),
      );
      setResults(data.matches);
      setSearched(true);
    });
  }
  function selectScope(value: 'book' | 'series') {
    setScope(value);
    setSelected(
      value === 'series' && seriesLink ? matchFor(seriesLink) : undefined,
    );
    const saved =
      link && (link.seriesKey ? 'series' : 'book') === value ? link : undefined;
    setVolume(saved?.volume ?? inferredVolume);
    setComplete(
      value === 'book' && (saved?.completeEntry ?? inferredVolume > 0),
    );
    setResults([]);
    setSearched(false);
    setQuery(value === 'series' ? book.series : book.title);
  }
  async function connect() {
    if (!account) return;
    await run('Opening MangaBaka', async () => {
      await connectTracking(account);
      if (account.kind === 'native') await refresh();
    });
  }
  async function save() {
    if (!account || !selected) return;
    await run('Saving', async () => {
      if (!isTauri()) await syncNow();
      if (series)
        await trackingRequest(
          account,
          '/v1/tracking/series',
          {
            seriesKey: series,
            seriesId: selected.id,
            title: selected.title,
            auto: automatic && !!state?.connected,
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
            volume,
            auto: automatic && !!state?.connected,
            ...(account.kind === 'native'
              ? { expectedAccountId: editAccountId }
              : {}),
            completeEntry: scope === 'book' && complete,
          },
          'PUT',
        );
      setEditing(false);
      await refresh();
      if (automatic) {
        await trackingRequest(account, '/v1/tracking/sync', {}, 'POST');
        await refresh();
      }
    });
  }
  async function remove() {
    await run('Unlinking', async () => {
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
      setUnlink(false);
      await refresh();
    });
  }
  return (
    <Modal
      title={series ? 'Series tracking' : 'Tracking'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="tracker-body">
        <p className="tracker-context">{title}</p>
        {(error || state?.error) && (
          <p role="alert" className="error">
            {error || state?.error}
          </p>
        )}
        {busy && (
          <p className="tracker-status" role="status">
            <LoaderCircle className="spinning" />
            {busy}…
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
              <h3>MangaBaka</h3>
              {link ? (
                <>
                  <a
                    className="tracker-link"
                    href={`https://mangabaka.org/${link.seriesId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.title}
                    <ExternalLink size={16} />
                  </a>
                  <p className="muted">
                    {series
                      ? `${seriesLinks.length} ${seriesLinks.length === 1 ? 'book' : 'books'} linked`
                      : link.seriesKey
                        ? 'Using series match'
                        : 'Book match'}{' '}
                    ·{' '}
                    {state.connected && linkedAuto
                      ? 'Auto-track on'
                      : 'Auto-track off'}
                  </p>
                  {link.error && (
                    <p role="alert" className="error">
                      {link.error}
                    </p>
                  )}
                  <div className="tracker-actions">
                    <button disabled={!!busy} onClick={edit}>
                      <Link2 />
                      Edit tracker
                    </button>
                    {state.connected && linkedAuto && (
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          void run('Updating', async () => {
                            if (!isTauri()) await syncNow();
                            await trackingRequest(
                              account!,
                              '/v1/tracking/sync',
                              {},
                              'POST',
                            );
                            await refresh();
                          })
                        }
                      >
                        <RefreshCw />
                        Update now
                      </button>
                    )}
                    <button disabled={!!busy} onClick={() => setUnlink(true)}>
                      <Unlink />
                      Unlink
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
                        <button disabled={!!busy} onClick={() => void remove()}>
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
                  Connected as {state.name}
                  <ChevronDown size={16} />
                </summary>
                <div className="tracker-actions">
                  {state.oauthAvailable && (
                    <button disabled={!!busy} onClick={() => void connect()}>
                      <RefreshCw />
                      Reconnect
                    </button>
                  )}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void run('Disconnecting', async () => {
                        await trackingRequest(
                          account!,
                          '/v1/tracking/account',
                          undefined,
                          'DELETE',
                        );
                        await refresh();
                      })
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
                    MangaBaka sign-in is not configured on this server.
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
                    placeholder="Title or MangaBaka link"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button disabled={!!busy || !query.trim()}>
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
                    onClick={() => setSelected(undefined)}
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
                    onClick={() => setSelected(match)}
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
                  <fieldset disabled={!!busy || !state.connected}>
                    <Switch
                      label="Automatically sync progress"
                      checked={automatic && state.connected}
                      onChange={setAutomatic}
                    />
                  </fieldset>
                  {!state.connected && (
                    <div className="tracker-connect-row">
                      <span className="muted">Connect to enable syncing</span>
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
                          <label>
                            Volume on completion
                            <input
                              type="number"
                              min={0}
                              max={10000}
                              step="any"
                              disabled={!!busy}
                              value={volume}
                              onChange={(e) =>
                                setVolume(Number(e.target.value))
                              }
                            />
                          </label>
                          <p className="muted tracker-hint">
                            Use 0 to sync detected completed chapters and leave
                            volume progress unchanged.
                          </p>
                          {scope === 'book' && (
                            <fieldset disabled={!!busy}>
                              <Switch
                                label="Mark entry completed when finished"
                                checked={complete}
                                onChange={setComplete}
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
              <button disabled={!!busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={
                  !!busy ||
                  !selected ||
                  !Number.isFinite(volume) ||
                  volume < 0 ||
                  volume > 10000
                }
                onClick={() => void save()}
              >
                <Check />
                {series ? 'Track series' : link ? 'Save' : 'Track'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
