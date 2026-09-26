import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaults, type Preferences } from '../src/domain/models';
import { ReadingSettings } from '../src/features/reader/ReadingSettings';
import { readerPreferences } from '../src/features/reader/customization';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('keeps global defaults separate from book settings and resets the override', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const bookId = 'a'.repeat(64);
  let p: Preferences = structuredClone(defaults);
  const render = () =>
    root.render(
      <ReadingSettings
        preferences={readerPreferences(p, bookId)}
        onPreferences={() => {
          throw new Error('Expected scoped change');
        }}
        customization={{
          preferences: p,
          bookId,
          onChange: (next) => {
            p = typeof next === 'function' ? next(p) : next;
            render();
          },
        }}
      />,
    );
  await act(async () => render());
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[value="book"]')!.click(),
  );
  const font = host.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    font.value = 'sans-serif';
    font.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(p.reader.font).toBe(defaults.reader.font);
  expect(p.bookReaderOverrides?.[bookId].font).toBe('sans-serif');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Use global defaults')!
      .click(),
  );
  expect(p.bookReaderOverrides?.[bookId]).toBeUndefined();
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[value="global"]')!.click(),
  );
  await act(async () => {
    font.value = 'sans-serif';
    font.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(p.reader.font).toBe('sans-serif');
  expect(p.bookReaderOverrides?.[bookId]).toBeUndefined();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
