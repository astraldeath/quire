import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi, afterEach } from 'vitest';
import { ScreenCaptureSettings } from './ScreenCaptureSettings';
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
async function mount(support = 'windows', enabled = false) {
  mock.invoke.mockResolvedValue({ support, enabled });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ScreenCaptureSettings />));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('restores the native preference and only changes it after native success', async () => {
  const t = await mount('windows', true);
  try {
    const toggle = t.host.querySelector('input')!;
    expect(toggle.checked).toBe(true);
    mock.invoke.mockRejectedValueOnce(new Error('denied'));
    await act(async () => toggle.click());
    expect(toggle.checked).toBe(true);
    expect(t.host.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not',
    );
    mock.invoke.mockResolvedValueOnce({ support: 'windows', enabled: false });
    await act(async () => toggle.click());
    expect(mock.invoke).toHaveBeenLastCalledWith('screen_capture', {
      enabled: false,
    });
    expect(toggle.checked).toBe(false);
  } finally {
    await t.close();
  }
});
it('explains limited macOS support and does not offer a Linux toggle', async () => {
  const mac = await mount('macos');
  expect(mac.host.textContent).toContain('may still capture');
  await mac.close();
  const linux = await mount('linux');
  expect(linux.host.querySelector('input')).toBeNull();
  expect(linux.host.textContent).toContain('not available');
  await linux.close();
});
it('does not offer native capture protection in a browser', async () => {
  mock.native = false;
  const t = await mount();
  expect(mock.invoke).not.toHaveBeenCalled();
  expect(t.host.textContent).toBe('');
  await t.close();
});
