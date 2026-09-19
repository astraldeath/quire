import { afterEach, expect, it, vi } from 'vitest';
import {
  discover,
  supportsMultipleFolders,
  supportsCurrentChapter,
} from './transport';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('negotiates old-server capabilities and refreshes after a server upgrade', async () => {
  const origin = 'https://folder-capabilities.example';
  let capabilities: string[] = [];
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          apiVersion: '1',
          apiUrl: origin + '/v1',
          name: 'Quire',
          capabilities,
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  await discover(origin);
  expect(await supportsMultipleFolders(origin)).toBe(false);
  expect(await supportsCurrentChapter(origin)).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  capabilities = ['multiple-folders', 'current-chapter'];
  now += 30001;
  expect(await supportsMultipleFolders(origin)).toBe(true);
  expect(await supportsCurrentChapter(origin)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
});
