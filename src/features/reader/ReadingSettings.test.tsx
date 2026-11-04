import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaults, type Preferences } from '../../domain/models';
import { ReadingSettings } from './ReadingSettings';
import { readerPreferences } from './customization';

it('keeps book overrides while editing defaults and explicitly restores defaults for this book', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let preferences: Preferences = {
    ...defaults,
    reader: { ...defaults.reader, size: 18 },
    bookReaderOverrides: { current: { size: 24 }, other: { size: 30 } },
  };
  const render = () =>
    root.render(
      <ReadingSettings
        preferences={readerPreferences(preferences, 'current')}
        onPreferences={() => {}}
        customization={{
          preferences,
          bookId: 'current',
          onChange: (value) => {
            preferences =
              typeof value === 'function' ? value(preferences) : value;
            render();
          },
        }}
      />,
    );
  try {
    await act(async () => render());
    const defaultsScope = [...host.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('Book defaults'),
    )!;
    await act(async () => defaultsScope.querySelector('input')!.click());
    expect(host.textContent).toContain('This book has custom settings.');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Increase font size"]')!
        .click(),
    );
    expect(preferences.reader.size).toBe(19);
    expect(readerPreferences(preferences, 'current').size).toBe(24);
    const bookScope = [...host.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('This book'),
    )!;
    await act(async () => bookScope.querySelector('input')!.click());
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === 'Use book defaults')!
        .click(),
    );
    expect(readerPreferences(preferences, 'current').size).toBe(19);
    expect(preferences.bookReaderOverrides).toEqual({ other: { size: 30 } });
    expect(host.textContent).not.toContain('Custom settings for this book');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
