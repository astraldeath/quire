import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { View } from 'foliate-js/view.js';
import { defaults } from '../src/domain/models';
import { applyReaderPreferences } from '../src/features/reader/Reader';
import { ReadingSettings } from '../src/features/reader/ReadingSettings';

vi.mock('foliate-js/view.js', () => ({ View: class {} }));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it('fits fixed pages without applying reader typography, colors, margins, or columns', () => {
  const renderer = Object.assign(document.createElement('div'), {
    setStyles: vi.fn(),
  });
  applyReaderPreferences({ renderer, isFixedLayout: true } as unknown as View, {
    ...defaults.reader,
    theme: 'dark',
    font: 'sans-serif',
    size: 36,
    columns: 'two',
    flow: 'continuous',
  });
  expect(renderer.getAttribute('zoom')).toBe('fit-page');
  expect(renderer.setStyles).not.toHaveBeenCalled();
  expect(renderer.hasAttribute('flow')).toBe(false);
  expect(renderer.hasAttribute('margin')).toBe(false);
  expect(renderer.hasAttribute('max-column-count')).toBe(false);
});

it('offers fixed-page behavior settings without unsupported typography or reflow controls', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <ReadingSettings
        fixedLayout
        preferences={defaults.reader}
        onPreferences={() => {}}
      />,
    ),
  );
  const tabs = [...host.querySelectorAll('[role="tab"]')];
  expect(tabs.map((tab) => tab.textContent)).toEqual(['Theme', 'Behavior']);
  await act(async () => (tabs[1] as HTMLElement).click());
  expect(host.textContent).toContain('Tap sides to turn pages');
  expect(host.textContent).toContain('Swipe to turn pages');
  expect(host.textContent).not.toContain('Page animation');
  await act(async () => root.unmount());
  host.remove();
});

it('distinguishes location previews, textless pages, and available word-by-word reading', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = async (previewing: boolean, onRsvp?: () => void) => {
    await act(async () =>
      root.render(
        <ReadingSettings
          preferences={defaults.reader}
          onPreferences={() => {}}
          previewing={previewing}
          onRsvp={onRsvp}
        />,
      ),
    );
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (t) => t.textContent === 'Word-by-word',
    )!;
    await act(async () => tab.click());
  };
  await render(true);
  expect(host.textContent).toContain('Choose Continue here');
  expect(host.textContent).not.toContain('Open a text chapter');
  await render(false);
  expect(host.textContent).toContain('Open a text chapter');
  const open = vi.fn();
  await render(false, open);
  expect(host.textContent).not.toContain('Open a text chapter');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Open word-by-word reader')!
      .click(),
  );
  expect(open).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
