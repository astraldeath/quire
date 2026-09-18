import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  state: {
    reader: {
      version: '0.2.0',
      supported: true,
      checking: false,
      installing: false,
      available: { version: '0.3.0', notes: 'Better reading.' },
    },
    server: {
      checking: false,
      data: {
        current: { version: 'old' },
        latest: { version: 'new', notes: 'Server fixes' },
        available: true,
        canManage: false,
      },
    },
  } as any,
  install: vi.fn(),
  check: vi.fn(),
}));
vi.mock('../src/features/updates/service', () => ({
  useUpdates: () => mocks.state,
  installReaderUpdate: mocks.install,
  checkUpdates: mocks.check,
}));
import { UpdateSettings } from '../src/features/updates/UpdateSettings';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
const root = createRoot(host);
afterEach(() => {
  vi.clearAllMocks();
});
it('only installs on explicit click and hides admin commands from ordinary users', async () => {
  await act(async () => root.render(<UpdateSettings />));
  expect(mocks.install).not.toHaveBeenCalled();
  expect(host.textContent).toContain('0.3.0');
  expect(host.textContent).not.toContain('docker compose');
  await act(async () =>
    Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Update and restart'))!
      .click(),
  );
  expect(mocks.install).toHaveBeenCalledOnce();
});
it('shows Docker instructions only to admins and disables controls during installation', async () => {
  mocks.state.server.data.canManage = true;
  mocks.state.reader.installing = true;
  mocks.state.reader.progress = 35;
  await act(async () => root.render(<UpdateSettings />));
  expect(host.textContent).toContain('docker compose pull');
  expect(host.textContent).toContain('35%');
  expect(
    Array.from(host.querySelectorAll('button')).every((b) => b.disabled),
  ).toBe(true);
  await act(async () => root.unmount());
});
