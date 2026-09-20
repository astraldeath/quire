import { comicImageType } from './comic-archive';

export interface ComicEntry {
  path: string;
  size: number;
  type: string;
}
const MAX_PAGE = 128 * 1024 * 1024;
const CACHE_BYTES = 64 * 1024 * 1024;

export function indexComicEntries(entries: ComicEntry[]) {
  if (entries.length > 50000)
    throw new Error('Comic has too many archive entries.');
  const paths = new Set<string>();
  const pages = new Map<string, number>();
  for (const { path, size, type } of entries) {
    if (
      !path ||
      path.startsWith('/') ||
      /[\\:\u0000-\u001f]/.test(path) ||
      path
        .split('/')
        .some((part) =>
          ['..', '__proto__', 'constructor', 'prototype'].includes(part),
        )
    )
      throw new Error('Comic contains an unsafe archive path.');
    if (paths.has(path)) throw new Error('Comic has duplicate archive paths.');
    paths.add(path);
    if (!['FILE', 'DIR'].includes(type))
      throw new Error('Comic contains an unsupported entry type or link.');
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error('Comic has an invalid entry size.');
    if (type === 'DIR' || !comicImageType(path) || path.startsWith('__MACOSX/'))
      continue;
    if (size > MAX_PAGE)
      throw new Error('Comic image exceeds safe decompression limits.');
    pages.set(path, size);
  }
  if (!pages.size) throw new Error('Comic has no supported image pages.');
  const collator = new Intl.Collator('en', { numeric: true });
  return new Map(
    [...pages].sort(([a], [b]) => collator.compare(a, b) || a.localeCompare(b)),
  );
}

export function openDecodedComic(
  pages: Map<string, number>,
  extract: (name: string, signal?: AbortSignal) => Promise<Blob>,
  dispose: () => void,
) {
  const cache = new Map<string, Blob>();
  let cachedBytes = 0;
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const check = (signal?: AbortSignal) => {
    if (closed) throw new Error('Comic is closed.');
    signal?.throwIfAborted();
  };
  return {
    names: [...pages.keys()],
    size: (name: string) => pages.get(name)!,
    blob(name: string, signal?: AbortSignal): Promise<Blob> {
      const request = queue.then(async () => {
        check(signal);
        if (!pages.has(name)) throw new Error('Comic page was not found.');
        const cached = cache.get(name);
        if (cached) {
          cache.delete(name);
          cache.set(name, cached);
          return cached;
        }
        const file = await extract(name, signal);
        check(signal);
        if (file.size !== pages.get(name) || file.size > MAX_PAGE)
          throw new Error('Comic page has an invalid extracted size.');
        const blob = file.slice(0, file.size, comicImageType(name));
        if (blob.size <= CACHE_BYTES) {
          while (
            cache.size &&
            (cache.size >= 3 || cachedBytes + blob.size > CACHE_BYTES)
          ) {
            const oldest = cache.keys().next().value!;
            cachedBytes -= cache.get(oldest)!.size;
            cache.delete(oldest);
          }
          cache.set(name, blob);
          cachedBytes += blob.size;
        }
        return blob;
      });
      queue = request.catch(() => {});
      return request;
    },
    close() {
      if (closed) return;
      closed = true;
      cache.clear();
      cachedBytes = 0;
      dispose();
    },
  };
}
