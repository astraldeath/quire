import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Account, SyncResponse } from './model';
import { SyncConflictError } from './errors';
import {
  deleteNativeFile,
  nativeFileId,
  readNativeFile,
  writeNativeFile,
} from '../../native-files';
const tokens = new Map<string, string>();
const folderCapabilities = new Map<
  string,
  {
    supported: boolean;
    currentChapter: boolean;
    checkedAt: number;
    limits: ServerLimits;
  }
>();
const legacyFileLimit = 128 * 1024 * 1024;
const storedFileLimit = 8 * 1024 * 1024 * 1024;
export interface ServerLimits {
  maxUploadBytes: number;
  maxDownloadBytes: number;
  serverAssignedUpload: boolean;
}
function limitValue(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new Error('Invalid server file limits.');
  return Math.min(value as number, storedFileLimit);
}
export async function serverLimits(origin: string): Promise<ServerLimits> {
  origin = serverOrigin(origin);
  const cached = folderCapabilities.get(origin);
  if (cached && Date.now() - cached.checkedAt < 30000) return cached.limits;
  await discover(origin);
  return folderCapabilities.get(origin)!.limits;
}
function checkFileSize(size: number, limit: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > limit)
    throw new Error(
      `Book file is too large. The limit is ${Math.floor(limit / 1048576)} MB.`,
    );
}
function transferFailure(origin: string, status: number): never {
  if (status === 413) {
    folderCapabilities.delete(origin);
    throw new Error(
      'The server file limit changed. Retry to check its current limit.',
    );
  }
  throw new Error(
    status === 401
      ? 'Sign in again; this session expired or was revoked.'
      : 'Could not upload the book. Try again.',
  );
}
export async function supportsMultipleFolders(origin: string) {
  const cached = folderCapabilities.get(origin);
  if (cached && Date.now() - cached.checkedAt < 30000) return cached.supported;
  await discover(origin);
  return folderCapabilities.get(origin)!.supported;
}
export async function supportsCurrentChapter(origin: string) {
  const cached = folderCapabilities.get(origin);
  if (cached && Date.now() - cached.checkedAt < 30000)
    return cached.currentChapter;
  await discover(origin);
  return folderCapabilities.get(origin)!.currentChapter;
}
export async function serverUpdatesCall(account: Account): Promise<unknown> {
  return isTauri()
    ? invoke('updates_call', {
        server: account.origin,
        username: account.username,
      })
    : accountRequest(account, '/v1/updates');
}
const browserSessionKey = 'quire-hosted-session';
export function clearBrowserSession() {
  try {
    sessionStorage.removeItem(browserSessionKey);
  } catch {}
}
const hosted = (origin: string) =>
  import.meta.env.VITE_HOSTED === 'true' &&
  !isTauri() &&
  origin === location.origin;
const credentials = (origin: string): RequestCredentials =>
  hosted(origin) ? 'same-origin' : 'omit';
function requestHeaders(token?: string): Record<string, string> {
  return token?.startsWith('cookie:')
    ? { 'X-Quire-Session': token.slice(7) }
    : token
      ? { Authorization: `Bearer ${token}` }
      : {};
}
export async function restoreBrowserAccount(): Promise<Account | undefined> {
  clearBrowserSession();
  if (!hosted(location.origin)) return;
  const r = await fetch(location.origin + '/v1/browser/session', {
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 401) return;
  if (!r.ok)
    throw new Error('Unable to restore your session. Refresh to try again.');
  const value = await r.json();
  if (
    typeof value?.username !== 'string' ||
    typeof value?.sessionId !== 'string'
  )
    throw new Error('Invalid browser session response.');
  return {
    origin: location.origin,
    username: value.username,
    sessionId: value.sessionId,
  };
}

export function serverOrigin(raw: string): string {
  const u = new URL(raw);
  if (
    (u.protocol !== 'https:' &&
      !(
        u.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      )) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/'
  )
    throw new Error('Use an HTTPS server address without a path.');
  return u.origin;
}
async function web(
  origin: string,
  path: string,
  body?: unknown,
  token?: string,
  method = body ? 'POST' : 'GET',
) {
  const response = await fetch(origin + path, {
    method,
    redirect: 'error',
    credentials: credentials(origin),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...requestHeaders(token),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(
      path.startsWith('/v1/admin/watches') && method === 'POST'
        ? 300000
        : 30000,
    ),
  });
  if (response.status === 409 && path === '/v1/sync')
    throw new SyncConflictError();
  if (!response.ok && path.startsWith('/v1/tracking')) {
    let message = 'Tracking request failed. Try again.';
    try {
      const error = await response.json();
      if (typeof error.error === 'string') message = error.error.slice(0, 300);
    } catch {}
    throw new Error(message);
  }
  if (!response.ok)
    throw new Error(
      response.status === 404 && path === '/v1/updates'
        ? 'Update Quire Server to enable version checks.'
        : response.status === 404 && path === '/v1/privacy/sync'
          ? 'Update Quire Server to sync private library settings.'
          : response.status === 401
            ? 'Sign in again; this session expired or was revoked.'
            : response.status === 409
              ? 'Sync conflict requires attention. Local changes are saved.'
              : response.status === 429
                ? 'Server is busy. Try again shortly.'
                : 'The server could not complete this request.',
    );
  if (response.status === 204) return null;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty server response.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 64 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Server response is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function discover(origin: string) {
  origin = serverOrigin(origin);
  const v = isTauri()
    ? await invoke<any>('sync_discover', { server: origin })
    : await web(origin, '/.well-known/quire');
  if (
    v?.apiVersion !== '1' ||
    v?.apiUrl !== origin + '/v1' ||
    typeof v?.name !== 'string'
  )
    throw new Error('This server is not compatible with Quire.');
  if (
    v.capabilities !== undefined &&
    (!Array.isArray(v.capabilities) ||
      v.capabilities.some((c: unknown) => typeof c !== 'string'))
  )
    throw new Error('Invalid server capabilities.');
  const limits: ServerLimits = {
    maxUploadBytes:
      v.limits === undefined
        ? legacyFileLimit
        : limitValue(v.limits?.maxUploadBytes),
    maxDownloadBytes:
      v.limits === undefined
        ? legacyFileLimit
        : limitValue(v.limits?.maxDownloadBytes),
    serverAssignedUpload:
      v.capabilities?.includes('server-assigned-upload') ?? false,
  };
  folderCapabilities.set(origin, {
    limits,
    currentChapter:
      Array.isArray(v.capabilities) &&
      v.capabilities.includes('current-chapter'),
    supported:
      Array.isArray(v.capabilities) &&
      v.capabilities.includes('multiple-folders'),
    checkedAt: Date.now(),
  });
  return { name: v.name.slice(0, 100), origin };
}
export async function login(
  origin: string,
  username: string,
  password: string,
) {
  if (isTauri())
    return await invoke<{ id: string }>('sync_login', {
      server: origin,
      username,
      password,
      device: /iPhone|iPad/.test(navigator.userAgent)
        ? 'Quire iOS'
        : 'Quire desktop',
    });
  const v = await web(
    origin,
    hosted(origin) ? '/v1/browser/session' : '/v1/sessions',
    { username, password, deviceName: 'Quire browser' },
  );
  if (!v?.session?.id || (!hosted(origin) && typeof v?.token !== 'string'))
    throw new Error('Invalid session response.');
  if (hosted(origin)) clearBrowserSession();
  else tokens.set(`${username}@${origin}`, v.token);
  return v.session as { id: string };
}
export async function logout(a: Account) {
  if (isTauri())
    return invoke<void>('sync_logout', {
      server: a.origin,
      username: a.username,
      session: a.sessionId,
    });
  if (hosted(a.origin)) {
    await web(
      a.origin,
      '/v1/browser/session',
      undefined,
      webToken(a),
      'DELETE',
    );
    clearBrowserSession();
    return;
  }
  const key = `${a.username}@${a.origin}`,
    token = tokens.get(key);
  tokens.delete(key);
  if (import.meta.env.VITE_HOSTED === 'true') clearBrowserSession();
  if (token)
    await web(
      a.origin,
      `/v1/sessions/${encodeURIComponent(a.sessionId)}`,
      undefined,
      token,
      'DELETE',
    );
}
export async function call(a: Account, body: unknown): Promise<SyncResponse> {
  if (isTauri()) {
    try {
      return await invoke<SyncResponse>('sync_call', {
        server: a.origin,
        username: a.username,
        body,
      });
    } catch (error) {
      if (String(error).includes('Sync conflict requires attention.'))
        throw new SyncConflictError();
      throw error;
    }
  }
  return web(a.origin, '/v1/sync', body, webToken(a));
}
export async function statsCall(a: Account, body: unknown): Promise<unknown> {
  if (isTauri())
    return invoke('statistics_call', {
      server: a.origin,
      username: a.username,
      body,
    });
  return web(a.origin, '/v1/statistics/sync', body, webToken(a));
}
export async function privacyCall(a: Account, body: unknown): Promise<unknown> {
  if (isTauri())
    return invoke('privacy_call', {
      server: a.origin,
      username: a.username,
      body,
    });
  return web(a.origin, '/v1/privacy/sync', body, webToken(a));
}
export interface ServerFile {
  bookId: string;
  size: number;
  uploaded: boolean;
  watched: boolean;
}
function webToken(a: Account) {
  if (hosted(a.origin)) return `cookie:${a.sessionId}`;
  const token = tokens.get(`${a.username}@${a.origin}`);
  if (!token) throw new Error('Sign in again.');
  return token;
}
export async function files(a: Account): Promise<ServerFile[]> {
  const v = isTauri()
    ? await invoke<any>('sync_files', {
        server: a.origin,
        username: a.username,
        delete: null,
      })
    : await web(a.origin, '/v1/files', undefined, webToken(a));
  if (
    !Array.isArray(v?.files) ||
    v.files.some(
      (f: any) =>
        !/^[a-f0-9]{64}$/.test(f.bookId) ||
        typeof f.uploaded !== 'boolean' ||
        typeof f.watched !== 'boolean' ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0,
    )
  )
    throw new Error('Invalid server file list.');
  return v.files;
}
export async function deleteUpload(a: Account, book: string) {
  if (isTauri())
    return invoke('sync_files', {
      server: a.origin,
      username: a.username,
      delete: book,
    });
  return web(
    a.origin,
    `/v1/books/${book}/file`,
    undefined,
    webToken(a),
    'DELETE',
  );
}
export async function upload(
  a: Account,
  book: string,
  bytes: Uint8Array | string,
) {
  const limits = await serverLimits(a.origin);
  if (typeof bytes !== 'string')
    checkFileSize(bytes.length, limits.maxUploadBytes);
  if (isTauri()) {
    const reference =
      typeof bytes === 'string' ? bytes : await writeNativeFile(bytes);
    try {
      return await invoke('sync_upload_file', {
        server: a.origin,
        username: a.username,
        book,
        reference,
      });
    } catch (error) {
      folderCapabilities.delete(a.origin);
      throw error;
    } finally {
      if (typeof bytes !== 'string') await deleteNativeFile(reference);
    }
  }
  if (typeof bytes === 'string') throw new Error('Invalid browser book file.');
  const r = await fetch(`${a.origin}/v1/books/${book}/file`, {
    method: 'PUT',
    redirect: 'error',
    credentials: credentials(a.origin),
    headers: {
      ...requestHeaders(webToken(a)),
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) transferFailure(a.origin, r.status);
}
export async function download(a: Account, book: string): Promise<Uint8Array> {
  const limits = await serverLimits(a.origin);
  if (isTauri()) {
    const reference = await invoke<string>('sync_download_file', {
      server: a.origin,
      username: a.username,
      book,
    });
    try {
      const id = nativeFileId(reference);
      if (!id) throw new Error('Invalid downloaded book reference.');
      return await readNativeFile(id, limits.maxDownloadBytes);
    } finally {
      await deleteNativeFile(reference);
    }
  }
  const r = await fetch(`${a.origin}/v1/books/${book}/file`, {
    redirect: 'error',
    credentials: credentials(a.origin),
    headers: { ...requestHeaders(webToken(a)) },
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok || !r.body) throw new Error('The server book file is unavailable.');
  const length = r.headers.get('Content-Length');
  if (
    length !== null &&
    (!/^\d+$/.test(length) ||
      !Number.isSafeInteger(Number(length)) ||
      Number(length) > limits.maxDownloadBytes)
  ) {
    await r.body.cancel();
    throw new Error('Invalid or oversized book file size.');
  }
  const reader = r.body.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limits.maxDownloadBytes) {
      await reader.cancel();
      throw new Error('Book file is too large.');
    }
    parts.push(value);
  }
  if (length !== null && Number(length) !== size)
    throw new Error('Incomplete downloaded book.');
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return bytes;
}

export async function metadata(
  a: Account,
  book: string,
): Promise<{ cover: string }> {
  const v = isTauri()
    ? await invoke<any>('sync_metadata', {
        server: a.origin,
        username: a.username,
        book,
      })
    : await web(a.origin, `/v1/books/${book}/metadata`, undefined, webToken(a));
  if (
    typeof v?.cover !== 'string' ||
    v.cover.length > 1024 * 1024 ||
    (v.cover !== '' &&
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.cover))
  )
    throw new Error('Invalid server cover.');
  return { cover: v.cover };
}

export async function accountRequest(
  a: Account,
  path: string,
  body?: unknown,
  method?: string,
) {
  return web(a.origin, path, body, webToken(a), method);
}

export async function uploadSharedFile(
  a: Account,
  library: string,
  file: File,
  signal: AbortSignal,
): Promise<{ bookId: string; size: number }> {
  signal.throwIfAborted();
  checkFileSize(file.size, storedFileLimit);
  const limits = await serverLimits(a.origin);
  signal.throwIfAborted();
  checkFileSize(
    file.size,
    limits.serverAssignedUpload
      ? limits.maxUploadBytes
      : Math.min(legacyFileLimit, limits.maxUploadBytes),
  );
  const combined = AbortSignal.any([signal, AbortSignal.timeout(300000)]);
  let id: string | undefined;
  let body: BodyInit = file;
  if (!limits.serverAssignedUpload) {
    const bytes = await file.arrayBuffer();
    combined.throwIfAborted();
    id = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    body = bytes;
  }
  combined.throwIfAborted();
  const r = await fetch(
    `${a.origin}/v1/admin/libraries/${encodeURIComponent(library)}/books${id ? '/' + id : ''}`,
    {
      method: id ? 'PUT' : 'POST',
      redirect: 'error',
      credentials: credentials(a.origin),
      headers: {
        ...requestHeaders(webToken(a)),
        'Content-Type': 'application/octet-stream',
      },
      body,
      signal: combined,
    },
  );
  if (!r.ok) transferFailure(a.origin, r.status);
  combined.throwIfAborted();
  if (id) return { bookId: id, size: file.size };
  if (r.status !== 201)
    throw new Error(
      'Invalid uploaded book response. Refresh the library before retrying.',
    );
  const result = await r.json();
  if (
    typeof result?.bookId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.bookId) ||
    !Number.isSafeInteger(result?.size) ||
    result.size !== file.size
  )
    throw new Error(
      'Invalid uploaded book response. Refresh the library before retrying.',
    );
  return { bookId: result.bookId, size: result.size };
}

export async function downloadServerBackup(
  a: Account,
  onProgress: (bytes: number, total: number) => void,
): Promise<Blob> {
  const r = await fetch(a.origin + '/v1/admin/backup', {
    method: 'POST',
    redirect: 'error',
    credentials: credentials(a.origin),
    headers: { ...requestHeaders(webToken(a)) },
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok || !r.body)
    throw new Error(
      'Could not create the backup. Check server disk space and try again.',
    );
  const limit = 512 * 1024 * 1024,
    total = Number(r.headers.get('Content-Length')) || 0;
  if (total > limit) {
    await r.body.cancel();
    throw new Error(
      'This backup exceeds the 512 MB browser limit. Use the server backup command below.',
    );
  }
  const reader = r.body.getReader(),
    parts: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > limit)
        throw new Error(
          'This backup exceeds the browser limit. Use the server backup command.',
        );
      parts.push(next.value.slice().buffer);
      onProgress(bytes, total);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  return new Blob(parts, { type: 'application/zip' });
}
