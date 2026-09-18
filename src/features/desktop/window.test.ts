import { beforeEach, expect, it, vi } from 'vitest';
import { desktopWindow } from './window';

const mocks = vi.hoisted(() => ({ native: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.native,
  invoke: mocks.invoke,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
});

it('does not invoke native window controls in a browser', async () => {
  mocks.native.mockReturnValue(false);
  expect(await desktopWindow()).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('uses the native build target to distinguish mobile from desktop', async () => {
  mocks.invoke.mockResolvedValue({ desktop: false });
  expect(await desktopWindow()).toBeNull();
  const state = {
    desktop: true,
    maximized: false,
    fullscreen: false,
    decorated: true,
  };
  mocks.invoke.mockResolvedValue(state);
  expect(await desktopWindow()).toEqual(state);
});
it('forwards only the selected control action and returns authoritative state', async () => {
  const state = {
    desktop: true,
    maximized: true,
    fullscreen: false,
    decorated: false,
  };
  mocks.invoke.mockResolvedValue(state);
  expect(await desktopWindow('maximize')).toEqual(state);
  expect(mocks.invoke).toHaveBeenCalledWith('desktop_window', {
    action: 'maximize',
  });
});
