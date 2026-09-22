import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BOOK_MIME, inferBookFormat, type BookFormat } from '../../books';
import { readNativeFile } from '../../native-files';
import { catalogBinaryRequest } from '../sync/transport';
import { catalogUrl, type CatalogLink } from './parser';
import {
  assertCatalogContext,
  catalogSourceKey,
  opdsAccountRequest,
  sourceCredentials,
  type CatalogContext,
  type CatalogSource,
} from './sources';
export type CatalogResponse = {
  body: string;
  contentType: string;
  url: string;
};
type Progress = (received: number, total?: number) => void;
export function acquisitionFormat(link: CatalogLink): BookFormat | undefined {
  if (
    link.indirect ||
    !link.rel.some(
      (r) =>
        r === 'http://opds-spec.org/acquisition' ||
        r === 'http://opds-spec.org/acquisition/open-access',
    )
  )
    return;
  return (
    (Object.entries(BOOK_MIME).find(
      ([, mime]) => mime === link.type?.split(';')[0],
    )?.[0] as BookFormat | undefined) ??
    inferBookFormat(new URL(link.url).pathname)
  );
}
export function catalogFilename(title: string, format: BookFormat) {
  return (
    (title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 160) || 'Book') +
    '.' +
    format
  );
}
export async function readCatalogResponse(
  response: Response,
  limit: number,
  signal: AbortSignal,
  progress?: Progress,
): Promise<Blob> {
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Check the catalog credentials.'
        : `Catalog request failed (${response.status}).`,
    );
  const total = Number(response.headers.get('Content-Length')) || undefined;
  if (total && total > limit) {
    await response.body?.cancel();
    throw new Error('Catalog response is too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The catalog returned an empty response.');
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Catalog response is too large.');
      chunks.push(value as Uint8Array<ArrayBuffer>);
      progress?.(size, total);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  signal.throwIfAborted();
  return new Blob(chunks, {
    type: response.headers.get('Content-Type') ?? 'application/octet-stream',
  });
}
async function native(
  ctx: CatalogContext,
  source: CatalogSource,
  url: string,
  kind: 'feed' | 'cover' | 'book',
  signal: AbortSignal,
  progress?: Progress,
): Promise<CatalogResponse | Blob> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID(),
    sourceKey = await catalogSourceKey(ctx, source.id);
  const stop = progress
    ? await listen<{ requestId: string; received: number; total?: number }>(
        'opds-progress',
        (e) => {
          if (e.payload.requestId === requestId)
            progress(e.payload.received, e.payload.total);
        },
      )
    : () => {};
  const cancel = () => {
    void invoke('opds_cancel', { requestId }).catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  let id: string | undefined;
  try {
    signal.throwIfAborted();
    const result = await invoke<any>('opds_fetch', {
      requestId,
      sourceKey,
      sourceUrl: source.url,
      url,
      kind,
    });
    id = result.id;
    signal.throwIfAborted();
    await assertCatalogContext(ctx);
    if (kind === 'feed') return result as CatalogResponse;
    const bytes = await readNativeFile(
      result.id,
      kind === 'cover' ? 8 * 1024 * 1024 : 8 * 1024 * 1024 * 1024,
      signal,
    );
    signal.throwIfAborted();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: result.mediaType,
    });
  } finally {
    signal.removeEventListener('abort', cancel);
    stop();
    if (id) await invoke('book_file_remove', { id }).catch(() => {});
  }
}
async function direct(
  ctx: CatalogContext,
  source: CatalogSource,
  url: string,
  signal: AbortSignal,
) {
  const credentials = await sourceCredentials(ctx, source);
  const headers: Record<string, string> = {};
  if (credentials && new URL(url).origin === new URL(source.url).origin) {
    const bytes = new TextEncoder().encode(
      credentials.username + ':' + credentials.password,
    );
    headers.Authorization =
      'Basic ' +
      btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  }
  try {
    return await fetch(url, {
      headers,
      signal,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(
      'This catalog does not allow browser access. Use the native app or connect through Quire Server.',
    );
  }
}
export async function fetchCatalog(
  ctx: CatalogContext,
  source: CatalogSource,
  url: string,
  signal: AbortSignal,
): Promise<CatalogResponse> {
  url = catalogUrl(url);
  signal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let result: CatalogResponse;
  if (isTauri())
    result = (await native(
      ctx,
      source,
      url,
      'feed',
      signal,
    )) as CatalogResponse;
  else if (ctx.account)
    result = await opdsAccountRequest(
      ctx.account,
      `/v1/catalog-sources/${source.id}/fetch`,
      { url, kind: 'feed' },
      'POST',
      signal,
    );
  else {
    const response = await direct(ctx, source, url, signal);
    const blob = await readCatalogResponse(response, 4 * 1024 * 1024, signal);
    result = {
      body: await blob.text(),
      contentType: blob.type,
      url: response.url || url,
    };
  }
  await assertCatalogContext(ctx);
  return result;
}
export async function fetchCatalogBlob(
  ctx: CatalogContext,
  source: CatalogSource,
  url: string,
  kind: 'book' | 'cover',
  signal: AbortSignal,
  progress?: Progress,
): Promise<Blob> {
  url = catalogUrl(url);
  if (kind === 'cover')
    signal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const blob = isTauri()
    ? ((await native(ctx, source, url, kind, signal, progress)) as Blob)
    : await readCatalogResponse(
        ctx.account
          ? await catalogBinaryRequest(
              ctx.account,
              source.id,
              url,
              kind,
              signal,
            )
          : await direct(ctx, source, url, signal),
        kind === 'cover' ? 8 * 1024 * 1024 : 8 * 1024 * 1024 * 1024,
        signal,
        progress,
      );
  await assertCatalogContext(ctx);
  return blob;
}
export async function downloadCatalogBook(
  ctx: CatalogContext,
  source: CatalogSource,
  link: CatalogLink,
  title: string,
  signal: AbortSignal,
  progress: Progress,
): Promise<File> {
  const format = acquisitionFormat(link);
  if (!format)
    throw new Error(
      'This acquisition requires a lending or purchase workflow that Quire does not support.',
    );
  const blob = await fetchCatalogBlob(
    ctx,
    source,
    link.url,
    'book',
    signal,
    progress,
  );
  return new File([blob], catalogFilename(title, format), {
    type: BOOK_MIME[format],
  });
}
