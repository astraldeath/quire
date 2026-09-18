import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopTitlebar } from './DesktopTitlebar';

const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('./window', () => ({ desktopWindow: mock.call }));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-desktop-titlebar');
});

async function fixture() {
  let state = {
    desktop: true,
    decorated: true,
    fullscreen: false,
    maximized: false,
  };
  const host = document.createElement('div');
  document.body.append(host);
  mock.call.mockImplementation(async (action = 'state') => {
    if (action === 'custom') {
      expect(
        host.querySelector('[aria-label="Window controls"]'),
      ).not.toBeNull();
      state = { ...state, decorated: false };
    }
    if (action === 'native') state = { ...state, decorated: true };
    if (action === 'maximize')
      state = { ...state, maximized: !state.maximized };
    return state;
  });
  const root = createRoot(host);
  await act(async () => root.render(<DesktopTitlebar />));
  return {
    host,
    fullscreen: () => {
      state = { ...state, fullscreen: true };
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('mounts before removing decorations and wires minimize, maximize/restore, and close', async () => {
  const test = await fixture();
  try {
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      true,
    );
    for (const [label, action] of [
      ['Minimize window', 'minimize'],
      ['Maximize window', 'maximize'],
      ['Restore window', 'maximize'],
      ['Close window', 'close'],
    ]) {
      await act(async () =>
        (
          test.host.querySelector(
            `[aria-label="${label}"]`,
          ) as HTMLButtonElement
        ).click(),
      );
      expect(mock.call).toHaveBeenCalledWith(action);
    }
  } finally {
    await test.close();
  }
});
it('combines library and window controls without dragging interactive controls, then restores the reader bar', async () => {
  const test = await fixture();
  const shell = document.createElement('div');
  shell.className = 'library-shell';
  shell.innerHTML =
    '<header class="topbar"><input aria-label="Search books"/><button>Settings</button></header>';
  try {
    await act(async () => {
      document.body.append(shell);
    });
    const header = shell.querySelector('header')!;
    expect(
      header.querySelector('[aria-label="Window controls"]'),
    ).not.toBeNull();
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      false,
    );
    mock.call.mockClear();
    await act(async () =>
      header
        .querySelector('input')!
        .dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, button: 0 }),
        ),
    );
    expect(mock.call).not.toHaveBeenCalledWith('drag');
    await act(async () =>
      header.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }),
      ),
    );
    expect(mock.call).toHaveBeenCalledWith('drag');
    await act(async () =>
      header.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }),
      ),
    );
    expect(mock.call).toHaveBeenCalledWith('maximize');
    await act(async () => shell.remove());
    expect(test.host.querySelector('.desktop-titlebar-drag')).not.toBeNull();
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      true,
    );
  } finally {
    shell.remove();
    await test.close();
  }
});
it('restores native controls for modal dialogs, then restores custom controls on dismissal', async () => {
  const test = await fixture();
  const dialog = document.createElement('dialog');
  try {
    await act(async () => {
      dialog.open = true;
      document.body.append(dialog);
    });
    expect(mock.call).toHaveBeenCalledWith('native');
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      false,
    );
    await act(async () => dialog.remove());
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      true,
    );
  } finally {
    dialog.remove();
    await test.close();
  }
});
it('hides the bar and removes the reader inset in fullscreen', async () => {
  const test = await fixture();
  try {
    await act(async () => {
      test.fullscreen();
      window.dispatchEvent(new Event('resize'));
    });
    expect(test.host.querySelector('header')?.hidden).toBe(true);
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      false,
    );
  } finally {
    await test.close();
  }
});

it('drags on primary press and maximizes on the second press', async () => {
  const test = await fixture();
  try {
    const region = test.host.querySelector('.desktop-titlebar-drag')!;
    await act(async () =>
      region.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }),
      ),
    );
    expect(mock.call).toHaveBeenCalledWith('drag');
    await act(async () =>
      region.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }),
      ),
    );
    expect(mock.call).toHaveBeenCalledWith('maximize');
  } finally {
    await test.close();
  }
});

it('restores native decorations when a window action fails', async () => {
  const test = await fixture();
  try {
    mock.call.mockRejectedValueOnce(new Error('control unavailable'));
    await act(async () =>
      (
        test.host.querySelector(
          '[aria-label="Minimize window"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(mock.call).toHaveBeenCalledWith('native');
    expect(test.host.querySelector('header')).toBeNull();
    expect(document.documentElement.hasAttribute('data-desktop-titlebar')).toBe(
      false,
    );
  } finally {
    await test.close();
  }
});

it('does not remove native decorations when a stale state response arrives after unmount', async () => {
  const test = await fixture();
  let resolve!: (state: {
    desktop: boolean;
    decorated: boolean;
    fullscreen: boolean;
    maximized: boolean;
  }) => void;
  mock.call.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(resolve).toBeTypeOf('function');
  await test.close();
  mock.call.mockClear();
  await act(async () =>
    resolve({
      desktop: true,
      decorated: true,
      fullscreen: false,
      maximized: false,
    }),
  );
  expect(mock.call).not.toHaveBeenCalledWith('custom');
  expect(mock.call).toHaveBeenLastCalledWith('native');
});

it('waits for an in-flight frame mutation before cleanup restores native decorations', async () => {
  const test = await fixture();
  const dialog = document.createElement('dialog');
  await act(async () => {
    dialog.open = true;
    document.body.append(dialog);
  });
  const implementation = mock.call.getMockImplementation()!;
  let resolve!: () => void;
  mock.call.mockImplementation((action?: string) =>
    action === 'custom'
      ? new Promise((done) => {
          resolve = () =>
            done({
              desktop: true,
              decorated: false,
              fullscreen: false,
              maximized: false,
            });
        })
      : implementation(action),
  );
  await act(async () => dialog.remove());
  expect(resolve).toBeTypeOf('function');
  mock.call.mockClear();
  await test.close();
  expect(mock.call).not.toHaveBeenCalledWith('native');
  await act(async () => resolve());
  expect(mock.call).toHaveBeenLastCalledWith('native');
});
