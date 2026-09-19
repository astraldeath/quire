import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ensureBookFile } from '../sync/library';
import { getNativeFileReference } from '../../storage';
import { epubFilename, exportEpub } from './epub-export';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock('../sync/library', () => ({ ensureBookFile: vi.fn() }));
vi.mock('../../storage', () => ({ getNativeFileReference: vi.fn() }));

describe('EPUB export', () => {
  const bytes = new Uint8Array([80, 75, 0, 128, 255]);
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(ensureBookFile).mockResolvedValue(bytes);
    vi.mocked(getNativeFileReference).mockResolvedValue(undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:epub'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('makes bounded portable meaningful names', () => {
    expect(epubFilename('Comic.cbz', 'cbz')).toBe('Comic.cbz');
    expect(epubFilename('Novel.fb2.zip', 'fbz')).toBe('Novel.fbz');
    expect(epubFilename('../A: Book? .epub')).toBe('A Book.epub');
    expect(epubFilename('CON')).toBe('Book CON.epub');
    expect(epubFilename('..')).toBe('Book.epub');
    expect(epubFilename('旅の本')).toBe('旅の本.epub');
    expect(
      new TextEncoder().encode(epubFilename('旅'.repeat(300))).length,
    ).toBeLessThanOrEqual(190);
  });

  it('exports a comic with its original format and MIME type', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await exportEpub({ id: 'comic', title: 'Comic', format: 'cbz' });
    const file = vi.mocked(URL.createObjectURL).mock.calls[0][0] as File;
    expect(file.name).toBe('Comic.cbz');
    expect(file.type).toBe('application/vnd.comicbook+zip');
  });

  it('passes exact original bytes and Unicode filename to native export and preserves cancellation', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(false);
    expect(await exportEpub({ id: 'server-book', title: '旅の本' })).toBe(
      false,
    );
    expect(ensureBookFile).toHaveBeenCalledWith('server-book');
    const [command, payload, options] = vi.mocked(invoke).mock.calls.at(-1)!;
    expect(command).toBe('export_epub');
    expect(payload).toBe(bytes);
    expect(options?.headers).toEqual({
      'x-quire-filename': btoa(
        String.fromCharCode(...new TextEncoder().encode('旅の本.epub')),
      ),
    });
  });

  it('exports a native file without reading its bytes into the webview', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(getNativeFileReference).mockResolvedValue('@quire-file:abc');
    vi.mocked(invoke).mockResolvedValue(true);
    vi.mocked(ensureBookFile).mockClear();
    expect(
      await exportEpub({ id: 'large', title: 'Comic', format: 'cbz' }),
    ).toBe(true);
    expect(ensureBookFile).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith('export_epub', undefined, {
      headers: {
        'x-quire-filename': btoa('Comic.cbz'),
        'x-quire-file-reference': '@quire-file:abc',
      },
    });
  });

  it('downloads a real EPUB file and releases its URL after the click', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('A Book.epub');
        expect(this.isConnected).toBe(true);
      });
    expect(await exportEpub({ id: 'local-book', title: 'A Book' })).toBe(true);
    const file = vi.mocked(URL.createObjectURL).mock.calls[0][0] as File;
    expect(file.type).toBe('application/epub+zip');
    expect(file.size).toBe(bytes.length);
    const exported = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
    expect(new Uint8Array(exported)).toEqual(bytes);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:epub');
  });

  it('treats share cancellation as normal without downloading', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi
        .fn()
        .mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
    });
    expect(await exportEpub({ id: 'book', title: 'Book' })).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('falls back to download if fetching consumed share activation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi
        .fn()
        .mockRejectedValue(
          new DOMException('No activation', 'NotAllowedError'),
        ),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await exportEpub({ id: 'book', title: 'Book' })).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('does not create an export when retrieval fails', async () => {
    vi.mocked(ensureBookFile).mockRejectedValueOnce(new Error('Offline'));
    await expect(exportEpub({ id: 'book', title: 'Book' })).rejects.toThrow(
      'Offline',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
