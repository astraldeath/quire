import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { useEffect, useSyncExternalStore } from 'react';
import { version } from '../../../package.json';
import { flushStorage, loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { serverUpdatesCall } from '../sync/transport';

export interface ServerUpdates {
  current: { version: string; revision: string; readerRevision: string };
  latest: null | {
    version: string;
    revision: string;
    publishedAt: string;
    notes: string;
    notesUrl: string;
  };
  available: boolean;
  checkedAt: string;
  canManage: boolean;
  error?: string;
}
export interface UpdatesState {
  reader: {
    version: string;
    supported: boolean;
    checking: boolean;
    available?: { version: string; notes: string };
    error?: string;
    installing: boolean;
    progress?: number;
  };
  server: { checking: boolean; data?: ServerUpdates; error?: string };
}
const CACHE_MS = 6 * 60 * 60 * 1000;
let state: UpdatesState = {
  reader: { version, supported: false, checking: false, installing: false },
  server: { checking: false },
};
const listeners = new Set<() => void>();
export const getUpdatesSnapshot = () => state;
function emit() {
  for (const listener of listeners) listener();
}
function reader(patch: Partial<UpdatesState['reader']>) {
  state = { ...state, reader: { ...state.reader, ...patch } };
  emit();
}
function server(patch: UpdatesState['server']) {
  state = { ...state, server: patch };
  emit();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid update information.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new Error('Invalid update information.');
  return value;
}
function timestamp(value: unknown, empty = false) {
  const result = text(value, 64, empty);
  if (
    result &&
    (!/^\d{4}-\d{2}-\d{2}T/.test(result) ||
      !Number.isFinite(Date.parse(result)))
  )
    throw new Error('Invalid update date.');
  return result;
}
export function parseServerUpdates(value: unknown): ServerUpdates {
  const data = object(value),
    current = object(data.current);
  if (
    typeof data.available !== 'boolean' ||
    typeof data.canManage !== 'boolean'
  )
    throw new Error('Invalid update information.');
  let latest: ServerUpdates['latest'] = null;
  if (data.latest !== null) {
    const item = object(data.latest);
    const notesUrl = text(item.notesUrl, 2048),
      url = new URL(notesUrl);
    if (
      url.protocol !== 'https:' ||
      url.host !== 'github.com' ||
      url.username ||
      url.password ||
      !url.pathname.startsWith('/astraldeath/quire-server/')
    )
      throw new Error('Invalid release notes link.');
    const revision = text(item.revision, 40);
    if (!/^[a-f0-9]{40}$/.test(revision))
      throw new Error('Invalid release revision.');
    latest = {
      version: text(item.version, 100),
      revision,
      publishedAt: timestamp(item.publishedAt),
      notes: text(item.notes, 32000, true),
      notesUrl,
    };
  }
  if (data.available && !latest) throw new Error('Invalid update information.');
  return {
    current: {
      version: text(current.version, 100),
      revision: text(current.revision, 100),
      readerRevision: text(current.readerRevision, 100),
    },
    latest,
    available: data.available,
    checkedAt: timestamp(data.checkedAt, true),
    canManage: data.canManage,
    ...(data.error === undefined
      ? {}
      : { error: text(data.error, 1000, true) }),
  };
}

let update: Update | null = null;
let readerChecked = -Infinity;
let readerRequest: Promise<void> | undefined;
async function close(handle: Update | null) {
  try {
    await handle?.close();
  } catch {
    /* A consumed native handle may already be closed. */
  }
}
async function checkReader(force: boolean): Promise<void> {
  if (
    state.reader.installing ||
    import.meta.env.VITE_HOSTED === 'true' ||
    !isTauri()
  )
    return;
  if (readerRequest) return readerRequest;
  if (!force && Date.now() - readerChecked < CACHE_MS) return;
  readerRequest = (async () => {
    readerChecked = Date.now();
    reader({ checking: true, error: undefined });
    let candidate: Update | null = null;
    try {
      const info = object(await invoke('updates_info'));
      if (typeof info.supported !== 'boolean')
        throw new Error('Invalid platform information.');
      reader({ version: text(info.version, 100), supported: info.supported });
      if (!info.supported) {
        await close(update);
        update = null;
        reader({ available: undefined });
        return;
      }
      // Mobile and hosted builds never load or call the updater plugin.
      const { check } = await import('@tauri-apps/plugin-updater');
      candidate = await check({ timeout: 30000 });
      const available = candidate
        ? {
            version: text(candidate.version, 100),
            notes: text(candidate.body ?? '', 32000, true),
          }
        : undefined;
      await close(update);
      update = candidate;
      candidate = null;
      reader({ available });
    } catch {
      await close(candidate);
      reader({ error: 'Could not check for reader updates. Try again.' });
    } finally {
      reader({ checking: false });
    }
  })();
  try {
    await readerRequest;
  } finally {
    readerRequest = undefined;
  }
}

const accountKey = (account?: Account) =>
  account
    ? JSON.stringify([account.origin, account.username, account.sessionId])
    : '';
let activeAccount = '';
let accountGeneration = 0;
let accountLookup = 0;
let serverChecked = -Infinity;
let serverRequest:
  { key: string; generation: number; promise: Promise<void> } | undefined;
async function checkServer(force: boolean): Promise<void> {
  const lookup = ++accountLookup;
  let account: Account | undefined;
  try {
    account = (await loadSync()).account;
  } catch {
    if (lookup === accountLookup) {
      activeAccount = '';
      accountGeneration++;
      server({ checking: false, error: 'Could not load the server account.' });
    }
    return;
  }
  if (lookup !== accountLookup) return;
  const key = accountKey(account);
  if (key !== activeAccount) {
    activeAccount = key;
    accountGeneration++;
    serverChecked = -Infinity;
    server({ checking: false });
  }
  if (!account) return;
  const generation = accountGeneration;
  if (serverRequest?.key === key && serverRequest.generation === generation)
    return serverRequest.promise;
  if (!force && Date.now() - serverChecked < CACHE_MS) return;
  serverChecked = Date.now();
  server({ ...state.server, checking: true, error: undefined });
  const stillCurrent = async () => {
    if (generation !== accountGeneration) return false;
    const currentKey = accountKey((await loadSync()).account);
    if (generation !== accountGeneration) return false;
    if (key !== currentKey) {
      activeAccount = currentKey;
      accountGeneration++;
      serverChecked = -Infinity;
      server({ checking: false });
      return false;
    }
    return true;
  };
  const promise = (async () => {
    try {
      const data = parseServerUpdates(await serverUpdatesCall(account));
      if (await stillCurrent())
        server({ checking: false, data, error: data.error });
    } catch {
      try {
        if (await stillCurrent())
          server({
            ...state.server,
            checking: false,
            error: 'Could not check for server updates. Try again.',
          });
      } catch {
        /* Account storage may be closing during logout. */
      }
    }
  })();
  serverRequest = { key, generation, promise };
  try {
    await promise;
  } finally {
    if (serverRequest?.promise === promise) serverRequest = undefined;
  }
}
export async function checkUpdates(force = true): Promise<void> {
  await Promise.all([checkReader(force), checkServer(force)]);
}
export async function installReaderUpdate(
  beforeInstall?: () => Promise<void>,
): Promise<void> {
  if (
    !state.reader.supported ||
    state.reader.checking ||
    state.reader.installing ||
    !update ||
    !isTauri() ||
    import.meta.env.VITE_HOSTED === 'true'
  )
    return;
  const installing = update;
  reader({ installing: true, error: undefined, progress: undefined });
  let received = 0,
    total: number | undefined;
  try {
    await beforeInstall?.();
    await flushStorage();
    await installing.downloadAndInstall(
      (event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength;
          received = 0;
        } else if (event.event === 'Progress')
          received += event.data.chunkLength;
        reader({
          progress:
            event.event === 'Finished'
              ? 100
              : total && total > 0
                ? Math.min(100, Math.max(0, (received / total) * 100))
                : undefined,
        });
      },
      { restartAfterInstall: true },
    );
    // Windows exits into its installer; AppImage replacement needs a relaunch.
    await invoke('updates_restart');
  } catch {
    reader({
      installing: false,
      progress: undefined,
      error: 'Could not install the update. Try again.',
    });
  }
}

let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const automaticCheck = () => {
  void checkUpdates(false);
};
export function initializeUpdates(): () => void {
  if (users++ === 0) {
    window.addEventListener('quire-synced', automaticCheck);
    window.addEventListener('quire-storage', automaticCheck);
    window.addEventListener('focus', automaticCheck);
    timer = setInterval(automaticCheck, CACHE_MS);
    automaticCheck();
  }
  return () => {
    if (--users === 0) {
      window.removeEventListener('quire-synced', automaticCheck);
      window.removeEventListener('quire-storage', automaticCheck);
      window.removeEventListener('focus', automaticCheck);
      clearInterval(timer);
    }
  };
}
export function useUpdates(): UpdatesState {
  useEffect(initializeUpdates, []);
  return useSyncExternalStore(
    subscribe,
    getUpdatesSnapshot,
    getUpdatesSnapshot,
  );
}
