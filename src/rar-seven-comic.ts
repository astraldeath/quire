import { proxy, wrap } from 'comlink';
import {
  indexComicEntries,
  openDecodedComic,
  type ComicEntry,
} from './comic-container';

interface Decoder {
  open(file: Blob): Promise<void>;
  listFiles(): Promise<ComicEntry[]>;
  extractSingleFile(
    name: string,
  ): Promise<{ fileData: Uint8Array } | undefined>;
}

export async function openRarSevenComic(
  bytes: Uint8Array,
  format: 'cbr' | 'cb7',
) {
  const signature =
    format === 'cb7'
      ? [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]
      : [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
  if (!signature.every((value, index) => bytes[index] === value))
    throw new Error(
      `This file is not a valid ${format.toUpperCase()} archive.`,
    );
  const worker = new Worker(
    new URL(
      `${import.meta.env.BASE_URL}assets/archive/worker-bundle.js`,
      location.href,
    ),
    { type: 'module' },
  );
  let stopped = false;
  const pending = new Set<(error: Error) => void>();
  const close = () => {
    if (stopped) return;
    stopped = true;
    worker.terminate();
    for (const reject of pending)
      reject(new Error('Comic decoder was closed.'));
    pending.clear();
  };
  worker.addEventListener('error', () => close());
  worker.addEventListener('messageerror', () => close());
  function bounded<T>(operation: Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new Error('Comic decoder was closed.'));
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        pending.delete(fail);
      };
      const timer = setTimeout(() => {
        fail(
          new Error(
            'Comic decoding took too long. Try opening the book again.',
          ),
        );
        close();
      }, 120000);
      pending.add(fail);
      operation.then((value) => {
        cleanup();
        resolve(value);
      }, fail);
    });
  }
  try {
    let ready!: () => void;
    const initialized = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const Remote = wrap<new (ready: () => void) => Decoder>(worker);
    const decoder = await bounded(new Remote(proxy(() => ready())));
    await bounded(initialized);
    await bounded(decoder.open(new Blob([bytes as Uint8Array<ArrayBuffer>])));
    const pages = indexComicEntries(await bounded(decoder.listFiles()));
    return openDecodedComic(
      pages,
      async (name) => {
        const result = await bounded(decoder.extractSingleFile(name));
        if (!result?.fileData)
          throw new Error('Comic page could not be decoded.');
        return new Blob([result.fileData as Uint8Array<ArrayBuffer>]);
      },
      close,
    );
  } catch (error) {
    close();
    throw error;
  }
}
