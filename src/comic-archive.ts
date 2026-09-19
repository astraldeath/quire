import { ZipReader, Uint8ArrayReader, type FileEntry } from '@zip.js/zip.js';

const MB = 1024 * 1024;
const MAX_PAGE = 128 * MB;
const CACHE_BYTES = 64 * MB;
export const comicImageType = (name: string) =>
  ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
  })[name.split('.').pop()?.toLowerCase() ?? ''];

/** Retain the compressed archive and a small LRU, never the entire expanded comic. */
export async function openComicArchive(bytes: Uint8Array) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
  });
  const entries = new Map<string, FileEntry>();
  const paths = new Set<string>();
  try {
    for await (const entry of reader.getEntriesGenerator()) {
      const name = entry.filename;
      if (paths.size >= 50000)
        throw new Error('CBZ has too many archive entries.');
      if (
        !name ||
        name.startsWith('/') ||
        name.includes('\\') ||
        name.split('/').includes('..') ||
        /[:\u0000-\u001f]/.test(name)
      )
        throw new Error('CBZ contains an unsafe archive path.');
      if (paths.has(name)) throw new Error('CBZ has duplicate archive paths.');
      paths.add(name);
      if (entry.encrypted)
        throw new Error('Password-protected CBZ archives are unsupported.');
      if (
        entry.directory ||
        !comicImageType(name) ||
        name.startsWith('__MACOSX/')
      )
        continue;
      if (
        entry.uncompressedSize > MAX_PAGE ||
        entry.uncompressedSize > Math.max(8 * MB, entry.compressedSize * 1000)
      )
        throw new Error('CBZ image exceeds safe decompression limits.');
      entries.set(name, entry);
    }
    if (!entries.size) throw new Error('CBZ has no supported image pages.');
  } catch (error) {
    await reader.close();
    throw error;
  }
  const collator = new Intl.Collator('en', { numeric: true });
  const names = [...entries.keys()].sort(
    (a, b) => collator.compare(a, b) || a.localeCompare(b),
  );
  const cache = new Map<string, Blob>();
  let cacheSize = 0;
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const lifetime = new AbortController();
  function check(signal?: AbortSignal) {
    if (closed) throw new Error('Comic is closed.');
    signal?.throwIfAborted();
  }
  return {
    names,
    size: (name: string) => entries.get(name)!.uncompressedSize,
    blob(name: string, signal?: AbortSignal): Promise<Blob> {
      // Serialize extraction to bound peak memory even during rapid scrolling.
      const request = queue.then(async () => {
        check(signal);
        const cached = cache.get(name);
        if (cached) {
          cache.delete(name);
          cache.set(name, cached);
          return cached;
        }
        const entry = entries.get(name)!;
        const controller = new AbortController();
        const abort = () => controller.abort();
        lifetime.signal.addEventListener('abort', abort, { once: true });
        signal?.addEventListener('abort', abort, { once: true });
        const chunks: BlobPart[] = [];
        let size = 0;
        try {
          await entry.getData(
            new WritableStream<Uint8Array>({
              write(chunk) {
                size += chunk.length;
                if (size > MAX_PAGE || size > entry.uncompressedSize)
                  throw new Error(
                    'CBZ image exceeds safe decompression limits.',
                  );
                chunks.push(chunk as Uint8Array<ArrayBuffer>);
              },
            }),
            { checkSignature: true, signal: controller.signal },
          );
          check(signal);
          const blob = new Blob(chunks, { type: comicImageType(name) });
          if (blob.size <= CACHE_BYTES) {
            while (
              cache.size &&
              (cache.size >= 2 || cacheSize + blob.size > CACHE_BYTES)
            ) {
              const oldest = cache.keys().next().value!;
              cacheSize -= cache.get(oldest)!.size;
              cache.delete(oldest);
            }
            cache.set(name, blob);
            cacheSize += blob.size;
          }
          return blob;
        } finally {
          lifetime.signal.removeEventListener('abort', abort);
          signal?.removeEventListener('abort', abort);
        }
      });
      queue = request.catch(() => {});
      return request;
    },
    close() {
      if (closed) return;
      closed = true;
      lifetime.abort();
      cache.clear();
      cacheSize = 0;
      // Let aborted extraction settle before releasing the archive reader.
      void queue.then(() => reader.close()).catch(() => {});
    },
  };
}
