import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Palette, Archive } from 'lucide-react';
import { SettingsTabs } from '../src/components/SettingsTabs';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('switches sections with keyboard navigation and preserves inactive content', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <SettingsTabs
        label="Settings sections"
        tabs={[
          {
            id: 'appearance',
            label: 'Appearance',
            icon: Palette,
            content: <input defaultValue="draft" />,
          },
          {
            id: 'backup',
            label: 'Backups',
            icon: Archive,
            content: <p>Backup controls</p>,
          },
        ]}
      />,
    ),
  );
  const tabs = host.querySelectorAll('button');
  const input = host.querySelector('input')!;
  input.value = 'kept';
  tabs[0].focus();
  await act(async () =>
    tabs[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    ),
  );
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[1]);
  expect(input.closest('[role=tabpanel]')?.hasAttribute('hidden')).toBe(true);
  await act(async () => tabs[0].click());
  expect(input.value).toBe('kept');
  await act(async () => root.unmount());
  host.remove();
});

it('settings layout mounts only active content and uses vertical desktop keys', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <SettingsTabs
        layout="settings"
        label="Sections"
        tabs={Array.from({ length: 7 }, (_, i) => ({
          id: String(i),
          label: `Section ${i}`,
          icon: Palette,
          content: <input aria-label={`Input ${i}`} />,
        }))}
      />,
    ),
  );
  expect(host.querySelectorAll('input')).toHaveLength(1);
  expect(host.querySelector('select')).toBeNull();
  expect(host.querySelectorAll('[role=tab]')).toHaveLength(7);
  expect(
    host.querySelector('[role=tablist]')?.getAttribute('aria-orientation'),
  ).toBe('vertical');
  const first = host.querySelector('button')!;
  await act(async () =>
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  );
  expect(host.querySelector('input')?.getAttribute('aria-label')).toBe(
    'Input 1',
  );
  await act(async () => root.unmount());
  host.remove();
});

it('guards section changes before unmounting and keeps controlled selection until accepted', async () => {
  const { registerNavigationBlocker } =
    await import('../src/features/navigation/blockers');
  let resume: (() => void) | undefined;
  const unregister = registerNavigationBlocker((action) => {
    resume = action;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changes: string[] = [];
  const tabs = [
    { id: 'one', label: 'One', icon: Palette, content: <input /> },
    { id: 'two', label: 'Two', icon: Archive, content: <p>Second</p> },
  ];
  await act(async () =>
    root.render(
      <SettingsTabs
        layout="settings"
        label="Sections"
        active="one"
        onActiveChange={(id) => changes.push(id)}
        tabs={tabs}
      />,
    ),
  );
  await act(async () => host.querySelectorAll('button')[1].click());
  expect(changes).toEqual([]);
  expect(host.querySelector('input')).not.toBeNull();
  await act(async () => resume!());
  expect(changes).toEqual(['two']);
  expect(host.querySelector('[aria-selected=true]')?.textContent).toBe('One');
  unregister();
  await act(async () =>
    root.render(
      <SettingsTabs
        layout="settings"
        label="Sections"
        disabled
        active="one"
        onActiveChange={(id) => changes.push(id)}
        tabs={tabs}
      />,
    ),
  );
  expect(
    [...host.querySelectorAll('button')].every((button) => button.disabled),
  ).toBe(true);
  await act(async () => host.querySelectorAll('button')[1].click());
  expect(changes).toHaveLength(1);
  await act(async () => root.unmount());
  host.remove();
});

it('uses horizontal labeled tabs and arrow keys on mobile', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SettingsTabs
          layout="settings"
          label="Sections"
          tabs={[
            {
              id: 'appearance',
              label: 'Appearance',
              icon: Palette,
              content: <p>Theme</p>,
            },
            {
              id: 'backups',
              label: 'Backups',
              icon: Archive,
              content: <p>Export</p>,
            },
          ]}
        />,
      ),
    );
    expect(host.querySelector('select')).toBeNull();
    expect(
      host.querySelector('[role=tablist]')?.getAttribute('aria-orientation'),
    ).toBe('horizontal');
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role=tab]');
    expect(tabs[0].textContent).toBe('Appearance');
    await act(async () =>
      tabs[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    );
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
