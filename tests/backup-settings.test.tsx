import {
  backupNeedsSaveGesture,
  exportBackup,
} from '../src/features/backup/export';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BackupSettings } from '../src/features/backup/BackupSettings';
import { createBackup } from '../src/features/backup/archive';
import { defaults, type Book } from '../src/domain/models';
import { Blob as NodeBlob } from 'node:buffer';
vi.mock('../src/features/backup/export', () => ({
  exportBackup: vi.fn().mockResolvedValue(false),
  backupNeedsSaveGesture: vi.fn(() => true),
}));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});
const book: Book = {
  id: 'a'.repeat(64),
  title: 'A book',
  author: '',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: false,
};
it('requires preview confirmation and leaves settings opt-in', async () => {
  const bytes = await createBackup([{ book }], defaults, 'data');
  const actions = {
    prepare: vi.fn(),
    restore: vi.fn().mockResolvedValue(undefined),
    exported: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <BackupSettings
        books={[book]}
        preferences={defaults}
        actions={actions}
        onBusy={() => {}}
      />,
    ),
  );
  const input = document.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    value: [new NodeBlob([bytes])],
  });
  await act(async () =>
    input.dispatchEvent(new Event('change', { bubbles: true })),
  );
  expect(document.body.textContent).toContain('0 new books; 1 matching books');
  expect(actions.restore).not.toHaveBeenCalled();
  expect(
    [...host.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Cancel',
    ),
  ).toHaveLength(1);
  expect(
    [...host.querySelectorAll('button')].some((b) => b.textContent === 'Back'),
  ).toBe(false);
  const restore = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Restore backup',
  )!;
  await act(async () => restore.click());
  expect(actions.restore).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'data' }),
    false,
  );
  expect(document.body.textContent).toContain('Backup restored.');
  await act(async () => root.unmount());
});
it('does not record a cancelled export as a completed backup', async () => {
  const actions = {
    prepare: vi.fn().mockResolvedValue(new Uint8Array([1])),
    restore: vi.fn(),
    exported: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <BackupSettings
        books={[]}
        preferences={defaults}
        actions={actions}
        onBusy={() => {}}
      />,
    ),
  );
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Create backup')!
      .click(),
  );
  expect(
    Array.from(document.querySelectorAll('button')).some(
      (b) => b.textContent === 'Create backup',
    ),
  ).toBe(false);
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.startsWith('Save prepared backup'))!
      .click(),
  );
  expect(actions.exported).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Backup exported.');
  await act(async () => root.unmount());
});

it.each([0, 1, 2])(
  'shows included and missing downloaded file counts (%s)',
  async (count) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <BackupSettings
          books={[
            { ...book, local: count > 0 },
            { ...book, id: 'b'.repeat(64), local: count > 1 },
          ]}
          preferences={defaults}
          actions={{ prepare: vi.fn(), restore: vi.fn(), exported: vi.fn() }}
          onBusy={() => {}}
        />,
      ),
    );
    expect(host.textContent).toContain('Downloaded books + data');
    expect(host.textContent).toContain(`${count} included`);
    expect(host.textContent).toContain(`${2 - count} not downloaded`);
    await act(async () => root.unmount());
    host.remove();
  },
);

it.each(['success', 'cancel', 'failed'])(
  'ordinary export prepares and saves in one action (%s)',
  async (result) => {
    vi.mocked(backupNeedsSaveGesture).mockReturnValue(false);
    if (result === 'failed')
      vi.mocked(exportBackup).mockRejectedValueOnce(new Error('disk'));
    else vi.mocked(exportBackup).mockResolvedValueOnce(result === 'success');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const actions = {
      prepare: vi.fn(async () => new Uint8Array([1])),
      restore: vi.fn(),
      exported: vi.fn(),
    };
    await act(async () =>
      root.render(
        <BackupSettings
          books={[]}
          preferences={defaults}
          actions={actions}
          onBusy={() => {}}
        />,
      ),
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Create backup')!
        .click(),
    );
    expect(actions.prepare).toHaveBeenCalledWith('full');
    expect(actions.exported).toHaveBeenCalledTimes(
      result === 'success' ? 1 : 0,
    );
    expect(host.textContent?.includes('Backup exported.')).toBe(
      result === 'success',
    );
    if (result === 'failed') {
      expect(host.querySelector('[role=alert]')).not.toBeNull();
      expect(host.textContent).not.toContain('connection');
    }
    await act(async () => root.unmount());
    host.remove();
  },
);
