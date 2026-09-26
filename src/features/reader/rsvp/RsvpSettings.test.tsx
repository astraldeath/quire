import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { defaults, type ReaderPreferences } from '../../../domain/models';
import { RsvpSettings } from './RsvpSettings';

it('keeps regular reading typography independent while selecting an imported RSVP font', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let preferences: ReaderPreferences = {
    ...defaults.reader,
    font: 'publisher',
    size: 18,
  };
  const font = `quire-font-${'a'.repeat(64)}`;
  const render = () =>
    root.render(
      <RsvpSettings
        preferences={preferences}
        onPreferences={(value) => {
          preferences = value;
          render();
        }}
        fonts={[{ value: font, label: 'My font' }]}
      />,
    );
  try {
    await act(async () => render());
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="RSVP font"]')!
        .click(),
    );
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '.font-picker-group button',
        ),
      ]
        .find((b) => b.textContent === 'My font')!
        .click(),
    );
    expect(preferences.rsvpFont).toBe(font);
    expect(preferences.font).toBe('publisher');
    expect(preferences.size).toBe(18);
    expect(
      (host.querySelector('.rsvp-word') as HTMLElement).style.fontFamily,
    ).toBe(`"${font}", Georgia, serif`);
    const guides = host.querySelector(
      '[aria-label="Alignment guides"]',
    ) as HTMLInputElement;
    await act(async () => guides.click());
    expect(host.querySelector('.rsvp-display-guides')).not.toBeNull();
    const pauses = host.querySelector(
      '[aria-label="Pause on long words"]',
    ) as HTMLInputElement;
    await act(async () => pauses.click());
    expect(preferences.rsvpLongWordPauses).toBe(true);
    const length = Array.from(host.querySelectorAll('[role="group"]')).find(
      (group) => group.textContent?.includes('Long word length'),
    );
    expect(length?.querySelector('input')?.value).toBe('8');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() {
    this.open = true;
  },
});
afterEach(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});
