import { expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { readNativeFile, nativeChunkSize } from '../src/native-files';
it('pipelines bounded native reads and assembles out-of-order chunks correctly', async () => {
  let active = 0,
    peak = 0;
  const size = nativeChunkSize * 7 + 3;
  invoke.mockImplementation(async (command, args) => {
    if (command === 'book_file_size') return size;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) =>
      setTimeout(resolve, args.offset === 0 ? 15 : 1),
    );
    active--;
    return new Uint8Array(args.length).fill(args.offset / nativeChunkSize + 1)
      .buffer;
  });
  const result = await readNativeFile('file');
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(4);
  expect(result.length).toBe(size);
  for (let i = 0; i < 8; i++) expect(result[i * nativeChunkSize]).toBe(i + 1);
});
it('rejects truncated native reads', async () => {
  invoke.mockImplementation(async (command) =>
    command === 'book_file_size' ? 8 : new ArrayBuffer(3),
  );
  await expect(readNativeFile('file')).rejects.toThrow('Incomplete');
});
it('rejects an already cancelled read before contacting native storage', async () => {
  invoke.mockClear();
  const controller = new AbortController();
  controller.abort();
  await expect(
    readNativeFile('file', undefined, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).not.toHaveBeenCalled();
});
it('does not allocate or start chunks when cancelled during size lookup', async () => {
  const controller = new AbortController();
  invoke.mockReset();
  invoke.mockImplementation(async (command) => {
    if (command === 'book_file_size') {
      controller.abort();
      return 64 * 1024 * 1024;
    }
    throw new Error('Read started after cancellation');
  });
  await expect(
    readNativeFile('file', undefined, controller.signal).then(() => undefined),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('stops scheduling chunks when cancelled during pipelined readback', async () => {
  const controller = new AbortController();
  let chunks = 0;
  invoke.mockImplementation(async (command, args) => {
    if (command === 'book_file_size') return nativeChunkSize * 10;
    chunks++;
    await Promise.resolve();
    controller.abort();
    return new ArrayBuffer(args.length);
  });
  await expect(
    readNativeFile('file', undefined, controller.signal).then(() => undefined),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(chunks).toBe(4);
});
