import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ServerBackups } from '../src/features/server/ServerBackups';
const { status, download } = vi.hoisted(() => ({
  status: vi.fn(),
  download: vi.fn(),
}));
vi.mock('../src/features/sync/transport', () => ({
  serverBackupStatus: status,
  downloadServerBackup: download,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it.each(['legacy', 'large', 'unknown', 'failed'])(
  'handles %s backup eligibility without unsafe assumptions',
  async (mode) => {
    status.mockReset();
    if (mode === 'failed') status.mockRejectedValue(new Error('network'));
    else
      status.mockResolvedValue(
        mode === 'legacy'
          ? null
          : {
              inputBytes: 800 * 1048576,
              browserLimitBytes: 512 * 1048576,
              fitsBrowser: mode === 'large' ? false : null,
            },
      );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ServerBackups
          account={{ origin: 'https://s.test', username: 'a', sessionId: 's' }}
        />,
      ),
    );
    expect(host.textContent).toContain('512 MiB');
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Download server backup',
    )!;
    expect(button.disabled).toBe(mode === 'large' || mode === 'failed');
    if (mode === 'large')
      expect(host.querySelector('details[open]')?.textContent).toContain(
        'quire-server backup',
      );
    if (mode === 'failed') expect(host.textContent).toContain('Retry');
    if (mode === 'unknown') expect(host.textContent).toContain('not yet known');
    await act(async () => root.unmount());
    host.remove();
  },
);
