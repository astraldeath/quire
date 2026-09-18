import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyProvider, usePrivacy } from './Privacy';
import { emptyPrivacy } from './model';
import { privacyReceived } from './sync';
import { restorePrivacy } from './shared';
const { native, platform } = vi.hoisted(() => ({
  native: vi.fn(async () => true),
  platform: { desktop: false, native: true },
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => platform.native,
  invoke: (command: string) =>
    command === 'desktop_window'
      ? Promise.resolve({ desktop: platform.desktop })
      : native(),
}));
vi.mock('../../storage', () => ({
  devicePrivacyKey: () => 'privacy-provider-test',
}));
vi.mock('../../components/Modal', () => ({
  Modal: ({ children, onClose }: { children: ReactNode; onClose(): void }) => (
    <section role="dialog">
      {children}
      <button onClick={onClose}>Cancel</button>
    </section>
  ),
}));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let privacy: ReturnType<typeof usePrivacy>;
function Harness() {
  privacy = usePrivacy();
  return <p>{privacy.access('book') ? 'Readable' : 'Locked'}</p>;
}
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('privacy-provider-test');
  vi.clearAllMocks();
  platform.desktop = false;
  platform.native = true;
});
it('only covers browser focus loss when the stricter option is enabled', async () => {
  platform.native = false;
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  const test = await fixture();
  try {
    await act(async () => privacy.update({ shield: true, autoLock: false }));
    focused.mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(test.host.querySelector('.privacy-cover')).toBeNull();
    await act(async () => privacy.update({ coverOnBlur: true }));
    expect(test.host.querySelector('.privacy-cover')).not.toBeNull();
    focused.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(test.host.querySelector('.privacy-cover')).toBeNull();
    await act(async () => privacy.update({ coverOnBlur: false }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    expect(test.host.querySelector('.privacy-cover')).not.toBeNull();
  } finally {
    await test.close();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  }
});
it('covers an inactive desktop without locking and restores its open prompt on focus', async () => {
  platform.desktop = true;
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  const test = await fixture();
  try {
    await act(async () => privacy.update({ shield: true }));
    await act(async () => {
      void privacy.authenticate();
    });
    focused.mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(test.host.querySelector('.privacy-cover')).not.toBeNull();
    expect(test.host.querySelector('[role="dialog"]')).not.toBeNull();
    focused.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(test.host.querySelector('.privacy-cover')).toBeNull();
    expect(test.host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Use biometrics')!
        .click(),
    );
    expect(privacy.unlocked).toBe(true);
    focused.mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(privacy.unlocked).toBe(true);
    await act(async () => privacy.update({ shield: false }));
    expect(test.host.querySelector('.privacy-cover')).toBeNull();
  } finally {
    await test.close();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  }
});
it('relocks an unlocked library immediately when remote protection changes', async () => {
  const test = await fixture();
  try {
    await act(async () => {
      void privacy.authenticate();
    });
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Use biometrics')!
        .click(),
    );
    expect(privacy.unlocked).toBe(true);
    localStorage.setItem(
      'privacy-provider-test',
      JSON.stringify({
        ...privacy.state,
        biometrics: false,
        credential: { salt: 'c'.repeat(32), hash: 'd'.repeat(64) },
      }),
    );
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent(privacyReceived, { detail: { changed: true } }),
      ),
    );
    expect(privacy.unlocked).toBe(false);
    expect(privacy.state.biometrics).toBe(false);
    expect(privacy.state.credential?.salt).toBe('c'.repeat(32));
  } finally {
    await test.close();
  }
});
it('merges backup protection against the latest persisted state and retains sync acknowledgements', async () => {
  const test = await fixture();
  try {
    const first = 'a'.repeat(64),
      second = 'b'.repeat(64);
    const latest = {
      ...privacy.state,
      books: { [first]: 'hidden' },
      sync: {
        account: 'account',
        revision: 4,
        baseline: {
          credential: privacy.state.credential,
          books: { [first]: 'hidden' },
        },
      },
    };
    localStorage.setItem('privacy-provider-test', JSON.stringify(latest));
    await act(async () =>
      privacy.update((current) => {
        const merged = restorePrivacy(current, {
          credential: current.credential!,
          books: { [second]: 'locked' },
        });
        return { credential: merged.credential!, books: merged.books };
      }),
    );
    expect(privacy.current().books).toEqual({
      [first]: 'hidden',
      [second]: 'locked',
    });
    expect(privacy.state.sync?.revision).toBe(4);
  } finally {
    await test.close();
  }
});
it('keeps native authentication open across transient WebView visibility changes', async () => {
  const test = await fixture();
  try {
    await act(async () => {
      void privacy.authenticate();
    });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    expect(test.host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Use biometrics')!
        .click(),
    );
    expect(privacy.access('book')).toBe(true);
    await act(async () => window.dispatchEvent(new Event('quire-background')));
    expect(privacy.access('book')).toBe(false);
  } finally {
    await test.close();
  }
});
it('uses the native cover without opening a second WebView dialog on resume', async () => {
  const test = await fixture();
  try {
    await act(async () => privacy.update({ shield: true }));
    await act(async () => window.dispatchEvent(new Event('quire-background')));
    expect(test.host.querySelector('dialog')).toBeNull();
    await act(async () => window.dispatchEvent(new Event('quire-foreground')));
    expect(test.host.textContent).toBe('Locked');
  } finally {
    await test.close();
  }
});
async function fixture() {
  localStorage.setItem(
    'privacy-provider-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential: { salt: 'a'.repeat(32), hash: 'b'.repeat(64) },
      biometrics: true,
      books: { book: 'hidden' },
    }),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <PrivacyProvider>
        <Harness />
      </PrivacyProvider>,
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('unlocks with successful native authentication and relocks on native background', async () => {
  const test = await fixture();
  try {
    let result!: Promise<boolean>;
    await act(async () => {
      result = privacy.authenticate();
    });
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Use biometrics')!
        .click(),
    );
    expect(await result).toBe(true);
    expect(privacy.access('book')).toBe(true);
    await act(async () => window.dispatchEvent(new Event('quire-background')));
    expect(privacy.access('book')).toBe(false);
    expect(test.host.textContent).toBe('Locked');
  } finally {
    await test.close();
  }
});
it('does not unlock after cancellation while biometric authentication is in flight', async () => {
  const test = await fixture();
  try {
    let resolve!: (value: boolean) => void;
    native.mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    let result!: Promise<boolean>;
    await act(async () => {
      result = privacy.authenticate();
    });
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Use biometrics')!
        .click(),
    );
    await act(async () =>
      Array.from(test.host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Cancel')!
        .click(),
    );
    await act(async () => resolve(true));
    expect(await result).toBe(false);
    expect(privacy.access('book')).toBe(false);
  } finally {
    await test.close();
  }
});
it('does not remove protection if the authentication prompt is dismissed', async () => {
  const test = await fixture();
  try {
    let result!: Promise<boolean>;
    await act(async () => {
      result = privacy.protect(['book'], 'normal');
    });
    await act(async () => privacy.lock());
    expect(await result).toBe(false);
    expect(privacy.state.books.book).toBe('hidden');
  } finally {
    await test.close();
  }
});
