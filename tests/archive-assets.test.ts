import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { archiveWorker } from '../scripts/archive-assets';
const source = readFileSync(
  'node_modules/libarchive.js/dist/worker-bundle.js',
  'utf8',
);
it('fails closed when the decoder dependency changes', () => {
  expect(() => archiveWorker(source + ' ')).toThrow(/review/i);
});
function decoder(size: number, encrypted = false) {
  const patched = archiveWorker(source);
  const code = patched.slice(
    patched.indexOf('class y{'),
    patched.indexOf('class E{'),
  );
  const Decoder = new Function(
    'const _={32768:"FILE"};' + code + ';return y;',
  )();
  let count = 0;
  const api = {
    openArchive: () => 1,
    getNextEntry: () => (count++ ? 0 : 2),
    getEntrySize: () => size,
    getEntryName: () => '1.png',
    getEntryType: () => 32768,
    getEntryLastModified: () => 0,
    entryIsEncrypted: () => encrypted,
    skipEntry: vi.fn(),
    getFileData: vi.fn(() => 0),
    closeArchive: vi.fn(),
  };
  return {
    instance: new Decoder({
      runCode: api,
      HEAPU8: new Uint8Array(3),
      _free: vi.fn(),
    }),
    api,
  };
}
it('checks entry size and encryption inside the worker before allocating file data', () => {
  for (const [size, encrypted] of [
    [129 * 1024 * 1024, false],
    [-1, false],
    [3, true],
  ] as const) {
    const { instance, api } = decoder(size, encrypted);
    expect(() => [...instance.entries(false)]).toThrow();
    expect(api.getFileData).not.toHaveBeenCalled();
    expect(api.closeArchive).toHaveBeenCalledTimes(1);
  }
});
it('releases archive handles on complete scans and early extraction exits', () => {
  const listing = decoder(3);
  expect([...listing.instance.entries(true)]).toHaveLength(1);
  expect(listing.api.getFileData).not.toHaveBeenCalled();
  expect(listing.api.closeArchive).toHaveBeenCalledTimes(1);
  const extraction = decoder(3);
  for (const entry of extraction.instance.entries(true, '1.png')) {
    expect(entry.fileData).toHaveLength(3);
    break;
  }
  expect(extraction.api.closeArchive).toHaveBeenCalledTimes(1);
});
