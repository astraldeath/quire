import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyProvider, usePrivacy } from './Privacy';
import { emptyPrivacy } from './model';
const { native } = vi.hoisted(() => ({ native: vi.fn(async () => true) }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: () => native(),
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
  localStorage.removeItem('privacy-provider-test');
  vi.clearAllMocks();
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
