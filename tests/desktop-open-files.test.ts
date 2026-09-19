import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import {
  readDesktopFile,
  startDesktopOpen,
} from '../src/features/desktop/open-files';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mock.invoke,
  isTauri: () => true,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: mock.listen }));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
it('reads only the granted handle in bounded chunks and retains the filename', async () => {
  mock.invoke.mockImplementation(
    async (_command, { length }) => new ArrayBuffer(length),
  );
  const file = await readDesktopFile({
    id: 'opaque',
    name: 'A book.pdf',
    size: 1024 * 1024 + 3,
  });
  expect(file.name).toBe('A book.pdf');
  expect(file.size).toBe(1024 * 1024 + 3);
  expect(mock.invoke).toHaveBeenLastCalledWith('desktop_open_read', {
    id: 'opaque',
    offset: 1024 * 1024,
    length: 3,
  });
});
it('waits for library readiness, consumes cold launch requests and releases failed imports', async () => {
  vi.useFakeTimers();
  let ready = false;
  mock.listen.mockResolvedValue(vi.fn());
  mock.invoke.mockImplementation(async (command) =>
    command === 'desktop_open_pending'
      ? [{ id: '1', name: 'book.pdf', size: 3 }]
      : command === 'desktop_open_read'
        ? new ArrayBuffer(3)
        : undefined,
  );
  const onFile = vi.fn().mockRejectedValue(new Error('bad PDF'));
  const error = vi.fn();
  const stop = startDesktopOpen(onFile, error, () => ready);
  await vi.advanceTimersByTimeAsync(500);
  expect(mock.invoke).not.toHaveBeenCalled();
  ready = true;
  await vi.advanceTimersByTimeAsync(500);
  expect(onFile).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
  expect(mock.invoke).toHaveBeenLastCalledWith('desktop_open_release', {
    id: '1',
  });
  stop();
});
it('reports native file errors without attempting a read', async () => {
  await expect(
    readDesktopFile({
      id: 'bad',
      name: 'missing.pdf',
      size: 0,
      error: 'File missing',
    }),
  ).rejects.toThrow('File missing');
  expect(mock.invoke).not.toHaveBeenCalled();
});

it('grants the startup event listener and its cleanup to the local main window on every platform', () => {
  const capability = JSON.parse(
    readFileSync('src-tauri/capabilities/main.json', 'utf8'),
  );
  expect(capability.windows).toContain('main');
  expect(capability.platforms).toBeUndefined();
  expect(capability.remote).toBeUndefined();
  expect(capability.permissions).toEqual(
    expect.arrayContaining([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
    ]),
  );
});
