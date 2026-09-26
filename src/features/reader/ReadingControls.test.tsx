import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaults } from '../../domain/models';
import { ReadingControls } from './ReadingControls';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it('edits persisted controls, announces shortcut conflicts, and resets each group', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const update = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReadingControls
          preferences={defaults.reader}
          onPreferences={update}
        />,
      ),
    );
    const select = (label: string) =>
      Array.from(host.querySelectorAll('label'))
        .find((item) => item.firstChild?.textContent === label)!
        .querySelector('select')!;
    const center = select('Center');
    await act(async () => {
      center.value = 'next';
      center.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update.mock.lastCall?.[0].tapZones.center).toBe('next');
    const search = select('Search');
    await act(async () => {
      search.value = 'ArrowRight';
      search.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update.mock.lastCall?.[0].shortcuts).toMatchObject({
      search: 'ArrowRight',
      next: '',
    });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Next page shortcut cleared.',
    );
    const reset = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reset shortcuts',
    )!;
    await act(async () => reset.click());
    expect(update.mock.lastCall?.[0].shortcuts).toMatchObject({
      next: 'ArrowRight',
      search: '',
    });
    expect(update.mock.lastCall?.[0].font).toBe(defaults.reader.font);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
