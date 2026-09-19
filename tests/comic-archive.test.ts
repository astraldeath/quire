import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import {
  ZipReader,
  ZipWriter,
  Uint8ArrayWriter,
  TextReader,
} from '@zip.js/zip.js';
import { openComicArchive } from '../src/comic-archive';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture() {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  for (const name of ['1.png', '2.png', '3.png', 'notes.txt'])
    await writer.add(name, new TextReader(name));
  return writer.close();
}

it('extracts only requested pages, shares a bounded LRU, and closes its reader', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const extract = vi.fn();
  const original = ZipReader.prototype.getEntriesGenerator;
  vi.spyOn(ZipReader.prototype, 'getEntriesGenerator').mockImplementation(
    async function* (this: ZipReader<Uint8Array>, ...args) {
      for await (const entry of original.apply(this, args)) {
        if (!entry.directory) {
          const getData = entry.getData.bind(entry);
          entry.getData = (...parameters) => {
            extract(entry.filename);
            return getData(...parameters);
          };
        }
        yield entry;
      }
      return true;
    },
  );
  const close = vi.spyOn(ZipReader.prototype, 'close');
  const archive = await openComicArchive(await fixture());
  expect(extract).not.toHaveBeenCalled();
  expect(await (await archive.blob('1.png')).text()).toBe('1.png');
  await archive.blob('1.png');
  expect(extract.mock.calls).toEqual([['1.png']]);
  await archive.blob('2.png');
  await archive.blob('3.png');
  await archive.blob('1.png');
  expect(extract.mock.calls).toEqual([
    ['1.png'],
    ['2.png'],
    ['3.png'],
    ['1.png'],
  ]);
  archive.close();
  await expect(archive.blob('2.png')).rejects.toThrow(/closed/i);
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not extract cancelled requests and remains usable after a cancellation', async () => {
  const archive = await openComicArchive(await fixture());
  const controller = new AbortController();
  const cancelled = archive.blob('1.png', controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  expect((await archive.blob('2.png')).size).toBe(5);
  archive.close();
});

it('aborts active extraction, rejects queued work, and releases the reader on close', async () => {
  const original = ZipReader.prototype.getEntriesGenerator;
  let extracting!: () => void;
  const started = new Promise<void>((resolve) => {
    extracting = resolve;
  });
  vi.spyOn(ZipReader.prototype, 'getEntriesGenerator').mockImplementation(
    async function* (this: ZipReader<Uint8Array>, ...args) {
      for await (const entry of original.apply(this, args)) {
        if (!entry.directory) {
          entry.getData = (_writer, options) =>
            new Promise((_resolve, reject) => {
              options!.signal!.addEventListener(
                'abort',
                () => reject(new DOMException('Cancelled', 'AbortError')),
                { once: true },
              );
              extracting();
            });
        }
        yield entry;
      }
      return true;
    },
  );
  const close = vi.spyOn(ZipReader.prototype, 'close');
  const archive = await openComicArchive(await fixture());
  const active = archive.blob('1.png');
  const queued = archive.blob('2.png');
  await started;
  archive.close();
  archive.close();
  await expect(active).rejects.toMatchObject({ name: 'AbortError' });
  await expect(queued).rejects.toThrow(/closed/i);
  await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
});

it('closes after archive validation fails, including unsafe paths and encryption', async () => {
  const close = vi.spyOn(ZipReader.prototype, 'close');
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add('../page.png', new TextReader('image'));
  await expect(openComicArchive(await writer.close())).rejects.toThrow(
    /unsafe/i,
  );
  expect(close).toHaveBeenCalledTimes(1);
  const encrypted = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    password: 'secret',
  });
  await encrypted.add('1.png', new TextReader('image'));
  await expect(openComicArchive(await encrypted.close())).rejects.toThrow(
    /Password-protected/,
  );
  expect(close).toHaveBeenCalledTimes(2);
});
