import { describe, expect, it, vi } from 'vitest';
import { bufferSections } from '../src/features/reader/section-buffer';
import { openBook } from '../src/books';
import { readFileSync } from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';

function fixture(count = 6) {
  const loads = Array.from({ length: count }, (_, i) =>
    vi.fn(async () => `blob:${i}`),
  );
  const unloads = loads.map(() => vi.fn());
  const sections = loads.map((load, i) => ({ load, unload: unloads[i] }));
  return { sections, loads, unloads, buffer: bufferSections(sections) };
}
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

describe('text section buffer', () => {
  it('releases real EPUB URLs only after their retained window ends', async () => {
    const urls = new Map<string, Blob | MediaSource>();
    let serial = 0;
    vi.stubGlobal('Blob', NodeBlob);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:buffer-${serial++}`;
      urls.set(url, blob);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      urls.delete(url);
    });
    let book: Awaited<ReturnType<typeof openBook>> | undefined;
    let buffer: ReturnType<typeof bufferSections> | undefined;
    try {
      book = await openBook(
        new Uint8Array(readFileSync('tests/fixtures/alice-in-wonderland.epub')),
        'epub',
      );
      const sections = book.publication.sections!;
      buffer = bufferSections(sections);
      const first = await sections[0].load();
      buffer.relocate(0);
      await sections[1].load();
      sections[0].unload?.();
      buffer.relocate(1);
      expect(urls.has(first)).toBe(true);
      expect(await sections[0].load()).toBe(first);
      sections[0].unload?.();
      await sections[3].load();
      sections[1].unload?.();
      buffer.relocate(3);
      expect(urls.has(first)).toBe(false);
    } finally {
      await buffer?.dispose();
      book?.publication.destroy();
      expect(urls.size).toBe(0);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('prioritizes navigation and skips obsolete queued prefetches', async () => {
    const { sections, loads, buffer } = fixture();
    const order: number[] = [];
    let resolve!: (value: string) => void;
    loads.forEach((load, i) =>
      load.mockImplementation(async () => {
        order.push(i);
        return `blob:${i}`;
      }),
    );
    loads[1].mockImplementation(
      () =>
        new Promise((r) => {
          order.push(1);
          resolve = r;
        }),
    );
    const current = sections[1].load();
    buffer.relocate(1);
    await settle();
    const next = sections[5].load();
    sections[1].unload();
    buffer.relocate(5);
    resolve('blob:one');
    await current;
    await next;
    await settle();
    expect(order).toEqual([1, 5, 4]);
    await buffer.dispose();
  });
  it('serializes underlying loads so shared EPUB assets cannot race', async () => {
    const { sections, loads, buffer } = fixture();
    let resolve!: (value: string) => void;
    loads[1].mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const current = sections[1].load();
    buffer.relocate(1);
    await settle();
    expect(loads[0]).not.toHaveBeenCalled();
    expect(loads[1]).toHaveBeenCalledOnce();
    expect(loads[2]).not.toHaveBeenCalled();
    const next = sections[2].load();
    resolve('blob:one');
    await current;
    expect(await next).toBe('blob:2');
    await buffer.dispose();
  });
  it('keeps previous/current/next and reuses resources without another EPUB reference', async () => {
    const { sections, buffer, loads, unloads } = fixture();
    await sections[2].load();
    buffer.relocate(2);
    await settle();
    expect(loads.map((load) => load.mock.calls.length)).toEqual([
      0, 1, 1, 1, 0, 0,
    ]);
    await sections[3].load();
    sections[2].unload();
    buffer.relocate(3);
    await settle();
    expect(unloads[1]).toHaveBeenCalledOnce();
    expect(unloads[2]).not.toHaveBeenCalled();
    await sections[2].load();
    sections[3].unload();
    buffer.relocate(2);
    await settle();
    expect(loads[2]).toHaveBeenCalledOnce();
    expect(loads[3]).toHaveBeenCalledOnce();
    await buffer.dispose();
    loads.forEach((load, i) =>
      expect(unloads[i]).toHaveBeenCalledTimes(load.mock.calls.length),
    );
  });

  it('coalesces pending prefetch and navigation', async () => {
    const { sections, loads, unloads, buffer } = fixture();
    let resolve!: (value: string) => void;
    loads[1].mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    buffer.relocate(0);
    await settle();
    const first = sections[1].load();
    const second = sections[1].load();
    expect(first).toBe(second);
    resolve('blob:pending');
    expect(await first).toBe('blob:pending');
    expect(loads[1]).toHaveBeenCalledOnce();
    await buffer.dispose();
    expect(unloads[1]).toHaveBeenCalledOnce();
  });

  it('releases late prefetches outside the latest window after fast navigation', async () => {
    const { sections, loads, unloads, buffer } = fixture();
    let resolve!: (value: string) => void;
    loads[1].mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    buffer.relocate(0);
    await settle();
    const foreground = sections[5].load();
    buffer.relocate(5);
    await settle();
    resolve('blob:stale');
    await foreground;
    await settle();
    expect(unloads[0]).toHaveBeenCalledOnce();
    expect(unloads[1]).toHaveBeenCalledOnce();
    expect(unloads[4]).not.toHaveBeenCalled();
    expect(unloads[5]).not.toHaveBeenCalled();
    await buffer.dispose();
  });

  it('does not release a frame that is still using a section outside the window', async () => {
    const { sections, unloads, buffer } = fixture();
    await sections[0].load();
    buffer.relocate(4);
    await settle();
    expect(unloads[0]).not.toHaveBeenCalled();
    sections[0].unload();
    expect(unloads[0]).toHaveBeenCalledOnce();
    await buffer.dispose();
  });

  it('ignores prefetch failure and allows navigation to retry', async () => {
    const { sections, loads, buffer } = fixture();
    loads[1].mockRejectedValueOnce(new Error('temporary'));
    buffer.relocate(0);
    await settle();
    expect(await sections[1].load()).toBe('blob:1');
    expect(loads[1]).toHaveBeenCalledTimes(2);
    await buffer.dispose();
  });

  it('waits for pending loads on close, releases them once, and prevents new loads', async () => {
    const { sections, loads, unloads, buffer } = fixture();
    let resolve!: (value: string) => void;
    loads[1].mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = sections[1].load();
    const rejected = expect(pending).rejects.toThrow(/closed/i);
    await settle();
    const disposed = buffer.dispose();
    resolve('blob:late');
    await rejected;
    await disposed;
    await buffer.dispose();
    expect(unloads[1]).toHaveBeenCalledOnce();
    await expect(sections[1].load()).rejects.toThrow(/closed/i);
    buffer.relocate(3);
    expect(loads[3]).not.toHaveBeenCalled();
  });
});
