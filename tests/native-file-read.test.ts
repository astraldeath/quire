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
