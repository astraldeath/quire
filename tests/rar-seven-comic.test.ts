import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRarSevenComic } from '../src/rar-seven-comic';

const state = vi.hoisted(() => ({
  sessions: [] as Array<{
    worker: EventTarget & { terminate: ReturnType<typeof vi.fn> };
    ready: () => void;
    extract: ReturnType<typeof vi.fn>;
  }>,
  pauseReady: false,
}));
vi.mock('comlink', () => ({
  proxy: (value: unknown) => value,
  wrap: (worker: EventTarget & { terminate: ReturnType<typeof vi.fn> }) =>
    class {
      extractSingleFile = vi.fn(() =>
        Promise.resolve({ fileData: new Uint8Array([1, 2, 3]) }),
      );
      constructor(ready: () => void) {
        state.sessions.push({ worker, ready, extract: this.extractSingleFile });
        if (!state.pauseReady) ready();
        return Promise.resolve(this) as unknown as this;
      }
      async open() {}
      async listFiles() {
        return ['1.png', '2.png'].map((path) => ({
          path,
          size: 3,
          type: 'FILE',
        }));
      }
    },
}));
beforeEach(() => {
  vi.useFakeTimers();
  state.sessions = [];
  state.pauseReady = false;
  vi.stubGlobal(
    'Worker',
    class extends EventTarget {
      terminate = vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const bytes = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);

it('cancels active extraction and lets the next queued page reopen the decoder', async () => {
  const book = await openRarSevenComic(bytes, 'cbr');
  state.sessions[0].extract.mockImplementationOnce(() => new Promise(() => {}));
  const controller = new AbortController();
  const first = book.blob('1.png', controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(0);
  const second = book.blob('2.png');
  controller.abort();
  await rejected;
  expect((await second).size).toBe(3);
  expect(state.sessions).toHaveLength(2);
  expect(state.sessions[0].worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  book.close();
});

it('cancels decoder initialization during reopen without retaining its timer', async () => {
  const book = await openRarSevenComic(bytes, 'cbr');
  state.sessions[0].worker.dispatchEvent(new Event('error'));
  state.pauseReady = true;
  const controller = new AbortController();
  const first = book.blob('1.png', controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  state.sessions[1].ready();
  state.pauseReady = false;
  expect((await book.blob('2.png')).size).toBe(3);
  expect(state.sessions).toHaveLength(3);
  book.close();
});

it('closing the book rejects active work and prevents reopening', async () => {
  const book = await openRarSevenComic(bytes, 'cbr');
  state.sessions[0].extract.mockImplementationOnce(() => new Promise(() => {}));
  const first = book.blob('1.png');
  const rejected = expect(first).rejects.toThrow(/closed/i);
  await vi.advanceTimersByTimeAsync(0);
  book.close();
  await rejected;
  await expect(book.blob('2.png')).rejects.toThrow(/closed/i);
  expect(state.sessions).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('terminates a timed-out decoder and permits a fresh page request', async () => {
  const book = await openRarSevenComic(bytes, 'cbr');
  state.sessions[0].extract.mockImplementationOnce(() => new Promise(() => {}));
  const first = book.blob('1.png');
  const rejected = expect(first).rejects.toThrow(/too long/i);
  await vi.advanceTimersByTimeAsync(120000);
  await rejected;
  expect((await book.blob('2.png')).size).toBe(3);
  expect(state.sessions).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
  book.close();
});
