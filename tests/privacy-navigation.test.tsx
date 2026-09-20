import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacySettings } from '../src/features/privacy/PrivacySettings';
import { LibraryDestination } from '../src/features/library/LibraryDestination';
const { p } = vi.hoisted(() => ({
  p: {
    state: { credential: { hash: 'unchanged' }, books: {}, biometrics: false },
    unlocked: true,
    authenticate: vi.fn(async () => true),
    update: vi.fn(),
    lock: vi.fn(),
  },
}));
vi.mock('../src/features/privacy/Privacy', () => ({ usePrivacy: () => p }));
vi.mock('../src/features/privacy/ScreenCaptureSettings', () => ({
  ScreenCaptureSettings: () => null,
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async () => true,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.clearAllMocks();
  p.unlocked = true;
});
async function fixture(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    root,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )!;
}
it('offers destinations without protected counts or titles', async () => {
  const hidden = vi.fn();
  const t = await fixture(
    <LibraryDestination
      hidden={false}
      onLibrary={() => {}}
      onHidden={hidden}
    />,
  );
  expect(t.host.textContent).not.toContain('Hidden books');
  await act(async () => button(t.host, 'All books').click());
  const item = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === 'Hidden books',
  )!;
  await act(async () => item.click());
  expect(hidden).toHaveBeenCalledOnce();
  await t.close();
});
it('focuses the new passcode once after authentication without stealing later focus', async () => {
  const t = await fixture(<PrivacySettings />);
  try {
    await act(async () => button(t.host, 'Change passcode').click());
    const fields = t.host.querySelectorAll<HTMLInputElement>(
      'input[type=password]',
    );
    expect(document.activeElement).toBe(fields[0]);
    fields[1].focus();
    await act(async () => t.root.render(<PrivacySettings connected />));
    expect(document.activeElement).toBe(fields[1]);
  } finally {
    await t.close();
  }
});
it('uses local copy, generic biometrics and clears edits on cancel and lock', async () => {
  const t = await fixture(<PrivacySettings connected={false} />);
  expect(t.host.textContent).toContain('Connect a server');
  expect(t.host.textContent).toContain('Biometric unlock');
  await act(async () => button(t.host, 'Change passcode').click());
  const input = t.host.querySelector(
    'input[type=password]',
  ) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, '123456');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button(t.host, 'Cancel').click());
  expect(t.host.querySelector('input[type=password]')).toBeNull();
  await act(async () => button(t.host, 'Change passcode').click());
  expect(
    (t.host.querySelector('input[type=password]') as HTMLInputElement).value,
  ).toBe('');
  p.unlocked = false;
  await act(async () => t.root.render(<PrivacySettings connected />));
  expect(t.host.querySelector('input[type=password]')).toBeNull();
  expect(p.update).not.toHaveBeenCalled();
  expect(t.host.textContent).toContain('sync with your server account');
  await t.close();
});
