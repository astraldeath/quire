import { expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { indexComicEntries, openDecodedComic } from '../src/comic-container';

const entry = (path: string, size = 3, type = 'FILE') => ({ path, size, type });
it('sorts comic pages naturally while excluding metadata and directories', () => {
  expect([
    ...indexComicEntries([
      entry('10.png'),
      entry('2.jpg'),
      entry('1.png'),
      entry('ComicInfo.xml'),
      entry('dir/', 0, 'DIR'),
      entry('__MACOSX/1.png'),
    ]).keys(),
  ]).toEqual(['1.png', '2.jpg', '10.png']);
});
it.each([
  '../page.png',
  '/page.png',
  'C:/page.png',
  'dir\\page.png',
  '__proto__/page.png',
])('rejects unsafe path %s', (path) => {
  expect(() => indexComicEntries([entry(path)])).toThrow(/unsafe/i);
});
it('rejects duplicate paths, symbolic links and oversized pages before extraction', () => {
  expect(() => indexComicEntries([entry('1.png'), entry('1.png')])).toThrow(
    /duplicate/i,
  );
  expect(() => indexComicEntries([entry('1.png', 1, 'SYMLINK')])).toThrow(
    /link|type/i,
  );
  expect(() => indexComicEntries([entry('1.png', 129 * 1024 * 1024)])).toThrow(
    /limit/i,
  );
});
it('extracts on demand, caches recently read pages and releases the decoder', async () => {
  const extract = vi.fn(async () => new NodeBlob(['abc']) as unknown as Blob);
  const close = vi.fn();
  const archive = openDecodedComic(
    indexComicEntries([entry('1.png'), entry('2.png')]),
    extract,
    close,
  );
  expect(extract).not.toHaveBeenCalled();
  expect((await archive.blob('1.png')).type).toBe('image/png');
  await archive.blob('1.png');
  expect(extract).toHaveBeenCalledTimes(1);
  archive.close();
  expect(close).toHaveBeenCalledTimes(1);
  await expect(archive.blob('2.png')).rejects.toThrow(/closed/i);
});
it('rejects corrupt extraction lengths and honors cancellation', async () => {
  const extract = vi.fn(
    async () => new NodeBlob(['incorrect']) as unknown as Blob,
  );
  const archive = openDecodedComic(
    indexComicEntries([entry('1.png')]),
    extract,
    vi.fn(),
  );
  await expect(archive.blob('1.png')).rejects.toThrow(/size/i);
  const controller = new AbortController();
  controller.abort();
  await expect(archive.blob('1.png', controller.signal)).rejects.toThrow();
  expect(extract).toHaveBeenCalledTimes(1);
  archive.close();
});
