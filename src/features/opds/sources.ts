import { openDB } from 'idb';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { devicePrivacyKey, loadSync } from '../../storage';
import { accountRequest, supportsOpds } from '../sync/transport';
import type { Account } from '../sync/model';
import { catalogUrl } from './parser';
export type CatalogSource = {
  id: string;
  name: string;
  url: string;
  revision: number;
  deleted: boolean;
};
export type SavedCatalogSource = CatalogSource & {
  dirty?: boolean;
  operationId?: string;
  conflict?: CatalogSource;
};
export type CatalogCredentials = { username: string; password: string };
export type CatalogContext = { key: string; account?: Account };
const sessionCredentials = new Map<string, CatalogCredentials>();
const db = () =>
  openDB('quire-catalogs', 1, {
    upgrade(db) {
      db.createObjectStore('sources');
      db.createObjectStore('imports');
    },
  });
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
export async function catalogContext(): Promise<CatalogContext> {
  const sync = await loadSync();
  const account = sync.enabled ? sync.account : undefined;
  return {
    key:
      devicePrivacyKey() +
      ':' +
      (account ? `${account.origin}:${account.username}` : 'device'),
    account,
  };
}
export async function assertCatalogContext(context: CatalogContext) {
  const current = await catalogContext();
  if (
    current.key !== context.key ||
    current.account?.sessionId !== context.account?.sessionId
  )
    throw new Error('Your account changed. Reopen Catalogs to continue.');
}
export function validateCatalogSources(value: unknown): CatalogSource[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new Error('Invalid catalog sources.');
  const seen = new Set<string>();
  return value.map((s) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(s.id) ||
      seen.has(s.id) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 200 ||
      typeof s.url !== 'string' ||
      s.url.length > 2048 ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0 ||
      typeof s.deleted !== 'boolean'
    )
      throw new Error('Invalid catalog source.');
    seen.add(s.id);
    return {
      id: s.id,
      name: s.name.trim(),
      url: catalogUrl(s.url),
      revision: s.revision,
      deleted: s.deleted,
    };
  });
}
export async function listCatalogSources(
  context?: CatalogContext,
): Promise<SavedCatalogSource[]> {
  const ctx = context ?? (await catalogContext());
  const store = await db();
  const saved = await store.get('sources', ctx.key);
  if (saved) return saved;
  // The first connection adopts this device's unsynchronized catalog metadata;
  // other accounts keep separate records and credentials.
  if (ctx.account) {
    const local: SavedCatalogSource[] =
      (await store.get('sources', devicePrivacyKey() + ':device')) ?? [];
    const sources = local
      .filter((s) => !s.deleted)
      .map((s) => ({
        ...s,
        revision: 0,
        dirty: true,
        conflict: undefined,
        operationId: crypto.randomUUID(),
      }));
    await assertCatalogContext(ctx);
    await store.put('sources', sources, ctx.key);
    return sources;
  }
  return [];
}
async function writeSources(
  ctx: CatalogContext,
  sources: SavedCatalogSource[],
) {
  await assertCatalogContext(ctx);
  await (await db()).put('sources', sources, ctx.key);
  window.dispatchEvent(new Event('quire-catalogs'));
}
export function mergeCatalogSources(
  local: SavedCatalogSource[],
  remote: CatalogSource[],
): SavedCatalogSource[] {
  const result = new Map(local.map((s) => [s.id, s]));
  for (const next of remote) {
    const prev = result.get(next.id);
    if (prev?.dirty) {
      const same =
        prev.name === next.name &&
        prev.url === next.url &&
        prev.deleted === next.deleted;
      result.set(
        next.id,
        same
          ? next
          : next.revision !== prev.revision
            ? { ...prev, conflict: next }
            : prev,
      );
    } else result.set(next.id, next);
  }
  return [...result.values()];
}
export async function opdsAccountRequest(
  account: Account,
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<any> {
  if (isTauri())
    return invoke('opds_account_call', {
      server: account.origin,
      username: account.username,
      path,
      method: method ?? (body ? 'POST' : 'GET'),
      body: body ?? null,
    });
  return accountRequest(account, path, body, method, { signal });
}
export async function catalogSourceKey(ctx: CatalogContext, id: string) {
  const data = new TextEncoder().encode(ctx.key + ':' + id);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function sourceCredentials(
  ctx: CatalogContext,
  source: CatalogSource,
) {
  return sessionCredentials.get(await catalogSourceKey(ctx, source.id));
}
export function saveCatalogSource(
  source: CatalogSource,
  credentials?: CatalogCredentials | null,
  expectedContext?: CatalogContext,
): Promise<void> {
  const context = expectedContext
    ? Promise.resolve(expectedContext)
    : catalogContext();
  return serial(async () => {
    const ctx = await context;
    await assertCatalogContext(ctx);
    const clean = validateCatalogSources([source])[0];
    const saved = await listCatalogSources(ctx);
    const existing = saved.find((s) => s.id === source.id);
    const next: SavedCatalogSource = {
      ...clean,
      revision: existing?.revision ?? clean.revision,
      dirty: true,
      operationId: crypto.randomUUID(),
    };
    const key = await catalogSourceKey(ctx, source.id);
    const clear =
      source.deleted ||
      (!!existing &&
        new URL(existing.url).origin !== new URL(clean.url).origin);
    const replacement = source.deleted
      ? null
      : credentials !== undefined
        ? credentials
        : clear
          ? null
          : undefined;
    await assertCatalogContext(ctx);
    if (isTauri() && replacement !== undefined)
      await invoke('opds_credentials', {
        sourceKey: key,
        sourceUrl: clean.url,
        credentials: replacement,
      });
    else if (!ctx.account) {
      if (replacement) sessionCredentials.set(key, replacement);
      else if (replacement === null) sessionCredentials.delete(key);
    }
    if (ctx.account && !isTauri() && credentials !== undefined) {
      // Hosted passwords must never enter local persistence, including offline queues.
      const remote = await opdsAccountRequest(
        ctx.account,
        `/v1/catalog-sources/${source.id}`,
        {
          name: next.name,
          url: next.url,
          baseRevision: next.revision,
          operationId: next.operationId,
          deleted: next.deleted,
          credentials: credentials ?? { username: '', password: '' },
        },
        'PUT',
      );
      const accepted = validateCatalogSources([remote])[0];
      await writeSources(ctx, [
        ...saved.filter((s) => s.id !== source.id),
        accepted,
      ]);
    } else
      await writeSources(ctx, [
        ...saved.filter((s) => s.id !== source.id),
        next,
      ]);
  }).then(() => {
    window.dispatchEvent(new Event('quire-catalogs-changed'));
  });
}
export async function deleteCatalogSource(
  id: string,
  expectedContext?: CatalogContext,
) {
  const ctx = expectedContext ?? (await catalogContext());
  await assertCatalogContext(ctx);
  const source = (await listCatalogSources(ctx)).find((s) => s.id === id);
  if (source) await saveCatalogSource({ ...source, deleted: true }, null, ctx);
}
export function syncCatalogSources(background = false): Promise<void> {
  const context = catalogContext();
  return serial(async () => {
    const ctx = await context;
    await assertCatalogContext(ctx);
    if (!ctx.account) return;
    if (!(await supportsOpds(ctx.account.origin))) {
      if (background) return;
      throw new Error('Update Quire Server to enable catalogs.');
    }
    await assertCatalogContext(ctx);
    const response = await opdsAccountRequest(
      ctx.account,
      '/v1/catalog-sources',
    );
    let sources = mergeCatalogSources(
      await listCatalogSources(ctx),
      validateCatalogSources(response.sources),
    );
    for (const source of sources.filter((s) => s.deleted && !s.conflict))
      await clearSourceCredentials(ctx, source);
    await writeSources(ctx, sources);
    for (const source of sources.filter((s) => s.dirty && !s.conflict)) {
      await assertCatalogContext(ctx);
      const result = await opdsAccountRequest(
        ctx.account,
        `/v1/catalog-sources/${source.id}`,
        {
          name: source.name,
          url: source.url,
          baseRevision: source.revision,
          operationId: source.operationId,
          deleted: source.deleted,
        },
        'PUT',
      );
      const accepted = validateCatalogSources([result])[0];
      sources = sources.map((s) => (s.id === source.id ? accepted : s));
      await writeSources(ctx, sources);
    }
    if (sources.some((s) => s.conflict))
      throw new Error(
        'Catalog changes need review in Add books → Browse catalogs.',
      );
  });
}
export function resolveCatalogSource(id: string, keepLocal: boolean) {
  const context = catalogContext();
  return serial(async () => {
    const ctx = await context,
      sources = await listCatalogSources(ctx);
    await assertCatalogContext(ctx);
    const source = sources.find((s) => s.id === id);
    if (!keepLocal && source?.conflict?.deleted)
      await clearSourceCredentials(ctx, source.conflict);
    await writeSources(
      ctx,
      sources.map((s) =>
        s.id === id && s.conflict
          ? keepLocal
            ? {
                ...s,
                revision: s.conflict.revision,
                operationId: crypto.randomUUID(),
                conflict: undefined,
                dirty: true,
              }
            : s.conflict
          : s,
      ),
    );
  });
}
async function clearSourceCredentials(
  ctx: CatalogContext,
  source: CatalogSource,
) {
  const sourceKey = await catalogSourceKey(ctx, source.id);
  await assertCatalogContext(ctx);
  sessionCredentials.delete(sourceKey);
  if (isTauri())
    await invoke('opds_credentials', {
      sourceKey,
      sourceUrl: source.url,
      credentials: null,
    });
}
export async function restoreCatalogSources(value: unknown) {
  for (const source of validateCatalogSources(value)) {
    const local = (await listCatalogSources()).find((s) => s.id === source.id);
    if (!local) await saveCatalogSource({ ...source, revision: 0 });
  }
}
export async function catalogImported(
  ctx: CatalogContext,
  url: string,
  bookId?: string,
): Promise<string | undefined> {
  const store = await db(),
    key = ctx.key + ':' + url;
  if (bookId) {
    await assertCatalogContext(ctx);
    await store.put('imports', bookId, key);
  }
  return store.get('imports', key);
}
