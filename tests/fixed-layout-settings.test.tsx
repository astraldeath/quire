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
