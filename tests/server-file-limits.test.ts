import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
const origin = location.origin;
const account = { origin, username: 'alice', sessionId: 'session' };
const discovery = (extra = {}) => ({
  apiVersion: '1',
  apiUrl: origin + '/v1',
  name: 'Quire',
  ...extra,
});
const modern = () =>
  discovery({
    capabilities: ['server-assigned-upload'],
    limits: { maxUploadBytes: 2147483648, maxDownloadBytes: 8589934592 },
  });
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_HOSTED', 'true');
});
function reply(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: (value as any)?.bookId ? 201 : 200,
  });
}
it('falls back only when valid discovery omits limit fields and caches discovery', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(discovery())));
  const t = await import('../src/features/sync/transport');
  expect(await t.serverLimits(origin)).toEqual({
    maxUploadBytes: 134217728,
    maxDownloadBytes: 134217728,
    serverAssignedUpload: false,
  });
  await t.serverLimits(origin);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  { limits: { maxUploadBytes: -1, maxDownloadBytes: 2 } },
  { limits: { maxUploadBytes: 1.5, maxDownloadBytes: 2 } },
  { limits: {} },
  { capabilities: 'bad' },
])('rejects malformed discovery %j', async (extra) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(discovery(extra))));
  await expect(
    (await import('../src/features/sync/transport')).serverLimits(origin),
  ).rejects.toThrow();
});
it('clamps valid limits to stored-format ceiling and propagates discovery failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      reply(
        discovery({
          limits: {
            maxUploadBytes: 9000000000,
            maxDownloadBytes: 9000000000,
          },
        }),
      ),
    ),
  );
  const t = await import('../src/features/sync/transport');
  expect((await t.serverLimits(origin)).maxUploadBytes).toBe(8589934592);
  vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  await expect(t.serverLimits('https://other.example')).rejects.toThrow(
    'offline',
  );
});
it('sends a modern large File directly without reading it and binds the hosted session', async () => {
  const file = new File(['book'], 'large.cbz');
  Object.defineProperty(file, 'size', { value: 150996694 });
  file.arrayBuffer = vi.fn(() => {
    throw new Error('must not read');
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(modern()))
      .mockResolvedValueOnce(
        reply({ bookId: 'a'.repeat(64), size: file.size }),
      ),
  );
  const t = await import('../src/features/sync/transport');
  expect(
    await t.uploadSharedFile(
      account,
      'library',
      file,
      new AbortController().signal,
    ),
  ).toEqual({ bookId: 'a'.repeat(64), size: file.size });
  expect(vi.mocked(fetch).mock.calls[1]).toEqual([
    origin + '/v1/admin/libraries/library/books',
    expect.objectContaining({
      method: 'POST',
      body: file,
      redirect: 'error',
      credentials: 'same-origin',
      headers: expect.objectContaining({ 'X-Quire-Session': 'session' }),
    }),
  ]);
  expect(file.arrayBuffer).not.toHaveBeenCalled();
});
it.each([modern(), discovery()])(
  'rejects size before reading or uploading',
  async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(payload)));
    const t = await import('../src/features/sync/transport');
    await t.serverLimits(origin);
    vi.mocked(fetch).mockClear();
    const file = new File([], 'huge.cbz');
    Object.defineProperty(file, 'size', { value: 2147483649 });
    file.arrayBuffer = vi.fn();
    await expect(
      t.uploadSharedFile(
        account,
        'library',
        file,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/large|limit|up to/i);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('legacy rejects more than 128 MiB even if it advertises a higher limit', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      reply(
        discovery({
          limits: {
            maxUploadBytes: 2147483648,
            maxDownloadBytes: 2147483648,
          },
        }),
      ),
    ),
  );
  const file = new File([], 'large.cbz');
  Object.defineProperty(file, 'size', { value: 134217729 });
  file.arrayBuffer = vi.fn();
  await expect(
    (await import('../src/features/sync/transport')).uploadSharedFile(
      account,
      'library',
      file,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(file.arrayBuffer).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('clears cached discovery after a server limit rejection', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(modern()))
      .mockResolvedValueOnce(new Response(null, { status: 413 }))
      .mockResolvedValueOnce(reply(discovery())),
  );
  const t = await import('../src/features/sync/transport');
  await expect(
    t.uploadSharedFile(
      account,
      'library',
      new File(['x'], 'x.cbz'),
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect((await t.serverLimits(origin)).maxUploadBytes).toBe(134217728);
});
it('rejects invalid download size headers before reading the body', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(modern()))
      .mockResolvedValueOnce(
        new Response('x', { headers: { 'Content-Length': '9000000000' } }),
      ),
  );
  await expect(
    (await import('../src/features/sync/transport')).download(
      account,
      'a'.repeat(64),
    ),
  ).rejects.toThrow(/large|size/i);
});
it('hashes and uploads a bounded legacy file with the same session binding', async () => {
  const file = new File(['book'], 'book.cbz');
  file.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(discovery()))
      .mockResolvedValueOnce(new Response(null, { status: 204 })),
  );
  const result = await (
    await import('../src/features/sync/transport')
  ).uploadSharedFile(account, 'library', file, new AbortController().signal);
  expect(result.bookId).toBe(
    '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  );
  expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
    method: 'PUT',
    redirect: 'error',
    credentials: 'same-origin',
    headers: { 'X-Quire-Session': 'session' },
  });
});
it('aborts the actual fetch signal when its caller cancels', async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(modern()))
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init!.signal!;
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
            started();
          }),
      ),
  );
  const t = await import('../src/features/sync/transport');
  const upload = t.uploadSharedFile(
    account,
    'library',
    new File(['book'], 'book.cbz'),
    controller.signal,
  );
  await ready;
  controller.abort();
  await expect(upload).rejects.toThrow('Aborted');
  expect(vi.mocked(fetch).mock.calls[1][1]?.signal?.aborted).toBe(true);
});
it.each([
  { bookId: 'invalid', size: 4 },
  { bookId: 'a'.repeat(64), size: 3 },
])('rejects malformed upload receipt %j', async (receipt) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(modern()))
      .mockResolvedValueOnce(reply(receipt)),
  );
  await expect(
    (await import('../src/features/sync/transport')).uploadSharedFile(
      account,
      'library',
      new File(['book'], 'book.cbz'),
      new AbortController().signal,
    ),
  ).rejects.toThrow('Invalid uploaded');
});
