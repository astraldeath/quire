import { invoke, isTauri } from '@tauri-apps/api/core';
import { listBooks } from '../../storage';
import {
  applySeries,
  newLink,
  parseMatches,
  progressPatch,
  searchPath,
  type LocalTracking,
  type SeriesMatch,
  type TrackingLink,
} from './local-model';
import { readTracking, writeTracking } from './local-store';
import { parseEntry, validateEntryPatch, type TrackerEntry } from './entry';

type Identity = { connected: boolean; name: string; accountId: string };
type Response = { status: number; data: any };
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>) {
  const next = queue.then(operation);
  queue = next.catch(() => {});
  return next;
}
async function identity(state: LocalTracking) {
  const current = await invoke<Identity>('tracking_status');
  if (current.connected && current.accountId !== state.accountId) {
    state.accountId = current.accountId;
    state.links = state.links.map((l) => ({
      ...l,
      auto: false,
      lastStep: 0,
      lastChapter: 0,
      lastSync: 0,
      error: '',
      nextAttempt: 0,
      lastAttempt: 0,
    }));
    await writeTracking(state);
  }
  return current;
}
async function provider(
  path: string,
  method = 'GET',
  body?: unknown,
  expectedAccountId?: string,
): Promise<Response> {
  return invoke<Response>('tracking_provider', {
    path,
    method,
    body: body ?? null,
    expectedAccountId,
  });
}
function requireSuccess(response: Response) {
  if (response.status < 200 || response.status >= 300)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Reconnect MangaBaka to resume tracking.'
        : response.status === 429
          ? 'MangaBaka is busy. Quire will retry later.'
          : 'MangaBaka is unavailable. Your progress remains saved.',
    );
  return response.data;
}
async function updateProgress(state: LocalTracking) {
  const who = await identity(state);
  if (!who.connected) return;
  const books = await listBooks();
  const now = Date.now();
  for (const link of [...state.links].sort(
    (a, b) => (a.lastAttempt ?? 0) - (b.lastAttempt ?? 0),
  )) {
    const book = books.find((b) => b.id === link.bookId);
    if (!book || !link.auto || link.nextAttempt > now) continue;
    const fraction = book.position?.fraction ?? 0;
    const step = fraction >= 0.999 ? 2 : fraction > 0 ? 1 : 0;
    const chapter =
      link.volume === 0 ? (book.position?.completedChapter ?? 0) : 0;
    if (step <= link.lastStep && chapter <= (link.lastChapter ?? 0)) continue;
    link.lastAttempt = now;
    try {
      if (chapter > 10000)
        throw new Error(
          'The detected chapter exceeds MangaBaka’s tracking limit. Your reading progress remains saved.',
        );
      const path = `/v1/my/library/${link.seriesId}`;
      const response = await provider(path, 'GET', undefined, state.accountId);
      let remote: {
        state: string;
        progress_volume: number;
        progress_chapter?: number;
      };
      if (response.status === 404) {
        requireSuccess(
          await provider(
            path,
            'POST',
            { state: 'reading', is_private: link.private ?? true },
            state.accountId,
          ),
        );
        remote = { state: 'reading', progress_volume: 0 };
      } else {
        const data = requireSuccess(response);
        if (
          !data ||
          typeof data.state !== 'string' ||
          (data.progress_chapter != null &&
            (!Number.isFinite(data.progress_chapter) ||
              data.progress_chapter < 0)) ||
          (data.progress_volume != null &&
            (!Number.isFinite(data.progress_volume) ||
              data.progress_volume < 0))
        )
          throw new Error('MangaBaka returned an invalid progress value.');
        remote = {
          state: data.state,
          progress_volume: data.progress_volume ?? 0,
          progress_chapter: data.progress_chapter ?? 0,
        };
      }
      const patch = progressPatch(link, step, remote, chapter);
      if (Object.keys(patch).length)
        requireSuccess(await provider(path, 'PUT', patch, state.accountId));
      link.lastStep = Math.max(link.lastStep, step);
      link.lastChapter = Math.max(link.lastChapter ?? 0, chapter);
      link.lastSync = Math.floor(Date.now() / 1000);
      link.nextAttempt = 0;
      link.error = '';
    } catch (error) {
      link.error = error instanceof Error ? error.message : String(error);
      link.nextAttempt = Date.now() + 60000;
    }
    await writeTracking(state);
    break; // One due book per pass keeps background work and API use bounded.
  }
}
let nextSearch = 0;
export async function nativeTrackingRequest(
  path: string,
  body?: any,
  method = body ? 'POST' : 'GET',
): Promise<any> {
  return serial(async () => {
    const state = await readTracking();
    if (path === '/v1/tracking' && method === 'GET')
      return {
        ...(await identity(state)),
        oauthAvailable: true,
        links: state.links,
      };
    if (path.startsWith('/v1/tracking/search?') && method === 'GET') {
      if (Date.now() < nextSearch)
        throw new Error('Wait a moment before searching again.');
      const query =
        new URL(path, 'https://quire.invalid').searchParams.get('q') ?? '';
      const endpoint = searchPath(query);
      nextSearch = Date.now() + 2100;
      return {
        matches: parseMatches(requireSuccess(await provider(endpoint))),
      };
    }
    if (path === '/v1/tracking/sync' && method === 'POST') {
      await updateProgress(state);
      return null;
    }
    if (path === '/v1/tracking/account' && method === 'DELETE') {
      await invoke('tracking_disconnect');
      state.links.forEach((l) => {
        l.auto = false;
      });
      await writeTracking(state);
      return null;
    }
    const entryRoute = path.match(/^\/v1\/tracking\/entries\/([1-9]\d{0,9})$/);
    if (entryRoute) {
      const seriesId = Number(entryRoute[1]);
      const who = await identity(state);
      if (!who.connected)
        throw new Error('Connect MangaBaka to manage tracking.');
      const books = await listBooks();
      if (
        !state.links.some(
          (l) =>
            l.seriesId === seriesId && books.some((b) => b.id === l.bookId),
        )
      )
        throw new Error('This tracker is no longer linked.');
      if (method !== 'GET' && body?.expectedAccountId !== who.accountId)
        throw new Error(
          'MangaBaka account changed. Reload the tracker and try again.',
        );
      if (!['GET', 'POST', 'PUT'].includes(method))
        throw new Error('Unsupported tracking action.');
      const changes: Partial<TrackerEntry> =
        method === 'PUT' ? validateEntryPatch(body?.changes) : {};
      if (method === 'POST' && typeof body?.is_private !== 'boolean')
        throw new Error('Choose tracking privacy.');
      const endpoint = `/v1/my/library/${seriesId}`;
      const response = await provider(
        endpoint,
        'GET',
        undefined,
        who.accountId,
      );
      let entry: TrackerEntry | null =
        response.status === 404 ? null : parseEntry(requireSuccess(response));
      if (method === 'POST') {
        const patch = { is_private: body.is_private as boolean };
        requireSuccess(
          await provider(
            endpoint,
            entry ? 'PUT' : 'POST',
            entry ? patch : { state: 'plan_to_read', ...patch },
            who.accountId,
          ),
        );
      } else if (method === 'PUT') {
        if (!entry)
          throw new Error(
            'This MangaBaka entry was removed. Add it again before editing.',
          );
        requireSuccess(await provider(endpoint, 'PUT', changes, who.accountId));
      }
      if (method !== 'GET') {
        // Acknowledge the reading position already present when the user edited progress.
        // Future reading still advances; the next background pass must not undo this edit.
        for (const link of state.links.filter((l) => l.seriesId === seriesId)) {
          if (method === 'POST' || 'is_private' in changes)
            link.private =
              method === 'POST' ? body.is_private : changes.is_private;
          if (
            method === 'PUT' &&
            ['state', 'progress_chapter', 'progress_volume'].some(
              (k) => k in changes,
            )
          ) {
            const book = books.find((b) => b.id === link.bookId);
            const fraction = book?.position?.fraction ?? 0;
            link.lastStep = Math.max(
              link.lastStep,
              fraction >= 0.999 ? 2 : fraction > 0 ? 1 : 0,
            );
            link.lastChapter = Math.max(
              link.lastChapter ?? 0,
              link.volume === 0 ? (book?.position?.completedChapter ?? 0) : 0,
            );
            link.nextAttempt = 0;
            link.error = '';
          }
        }
        await writeTracking(state);
        entry = parseEntry(
          requireSuccess(
            await provider(endpoint, 'GET', undefined, who.accountId),
          ),
        );
      }
      return { entry, accountId: who.accountId };
    }
    if (path === '/v1/tracking/series') {
      if (method === 'DELETE')
        state.links = state.links.filter((l) => l.seriesKey !== body.seriesKey);
      else if (method === 'PUT') {
        const who = await identity(state);
        if (body.expectedAccountId !== who.accountId)
          throw new Error(
            'MangaBaka account changed. Review the tracker and save again.',
          );
        state.links = applySeries(state.links, await listBooks(), {
          ...body,
          auto: !!body.auto && who.connected,
        } as SeriesMatch);
      } else throw new Error('Unsupported tracking action.');
    } else if (path.startsWith('/v1/tracking/books/')) {
      const bookId = path.slice('/v1/tracking/books/'.length);
      if (method === 'DELETE')
        state.links = state.links.filter((l) => l.bookId !== bookId);
      else if (method === 'PUT') {
        const who = await identity(state);
        if (body.expectedAccountId !== who.accountId)
          throw new Error(
            'MangaBaka account changed. Review the tracker and save again.',
          );
        const book = (await listBooks()).find((b) => b.id === bookId);
        if (!book) throw new Error('This book is no longer in your library.');
        const value = body as TrackingLink;
        const link = newLink({
          bookId,
          seriesId: value.seriesId,
          title: value.title,
          seriesKey: value.seriesKey === book.series ? book.series : '',
          volume: value.volume,
          auto: !!value.auto && who.connected,
          completeEntry: !value.seriesKey && !!value.completeEntry,
          private:
            value.private ??
            state.links.find((l) => l.bookId === bookId)?.private ??
            true,
        });
        state.links = [...state.links.filter((l) => l.bookId !== bookId), link];
      } else throw new Error('Unsupported tracking action.');
    } else throw new Error('Unsupported tracking action.');
    await writeTracking(state);
    return null;
  });
}
export function connectNativeTracking() {
  return serial(() => invoke('tracking_connect'));
}
export function startNativeTracking() {
  if (!isTauri()) return () => {};
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (pending || document.hidden || !navigator.onLine) return;
    pending = true;
    void nativeTrackingRequest('/v1/tracking/sync', {}, 'POST')
      .catch(() => {})
      .finally(() => {
        pending = false;
      });
  };
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 1500);
  };
  window.addEventListener('quire-storage', changed);
  window.addEventListener('quire-synced', changed);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  const interval = setInterval(run, 15000);
  run();
  return () => {
    clearInterval(interval);
    clearTimeout(timer);
    window.removeEventListener('quire-storage', changed);
    window.removeEventListener('quire-synced', changed);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
  };
}
