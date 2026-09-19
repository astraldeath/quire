import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FileHandlingSettings } from './FileHandlingSettings';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), native: true }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mock.invoke,
  isTauri: () => mock.native,
}));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.resetAllMocks();
  mock.native = true;
});
async function mount(platform = 'windows') {
  mock.invoke.mockResolvedValue(platform);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<FileHandlingSettings />));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
    },
  };
}
it('only opens Windows default app settings on user action and offers a recovery path', async () => {
  const t = await mount();
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(mock.invoke).toHaveBeenCalledWith('desktop_file_platform');
  mock.invoke.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => t.host.querySelector('button')!.click());
  expect(mock.invoke).toHaveBeenLastCalledWith('desktop_default_apps');
  expect(t.host.querySelector('[role="status"]')?.textContent).toContain(
    'Windows Settings',
  );
  await t.close();
});
it('gives platform-specific instructions without pretending to set defaults', async () => {
  for (const platform of ['macos', 'linux']) {
    const t = await mount(platform);
    expect(t.host.querySelector('button')).toBeNull();
    expect(t.host.textContent).toContain(
      platform === 'macos' ? 'Change All' : 'file manager',
    );
    await t.close();
  }
});
it('hides desktop integration on mobile and web', async () => {
  const mobile = await mount('mobile');
  expect(mobile.host.textContent).toBe('');
  await mobile.close();
  mock.native = false;
  mock.invoke.mockClear();
  const web = await mount();
  expect(web.host.textContent).toBe('');
  expect(mock.invoke).not.toHaveBeenCalled();
  await web.close();
});
