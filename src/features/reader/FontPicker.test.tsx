import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FontPicker } from './FontPicker';
import { fontFamily } from './customization';
const native = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => native);
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() {
    this.open = true;
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('keeps defaults first, asks before browser enumeration, and selects a searched system family', async () => {
  const query = vi
    .fn()
    .mockResolvedValue([
      { family: 'Zulu' },
      { family: 'Arial' },
      { family: 'Arial' },
    ]);
  vi.stubGlobal('queryLocalFonts', query);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <FontPicker
        value="Georgia"
        onChange={changed}
        imported={[
          { value: 'quire-font-' + 'a'.repeat(64), label: 'Imported test' },
        ]}
      />,
    ),
  );
  await act(async () => host.querySelector('button')!.click());
  expect(query).not.toHaveBeenCalled();
  expect(
    [...document.querySelectorAll('.font-picker-group h3')].map(
      (n) => n.textContent,
    ),
  ).toEqual(['Defaults', 'System fonts', 'Imported fonts']);
  expect(
    [...document.querySelectorAll('.font-picker-group')][0].textContent,
  ).toContain('PublisherSerifSans serif');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.font-picker-load')!.click(),
  );
  expect(query).toHaveBeenCalledOnce();
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Search fonts"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'arial');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const choices = document.querySelectorAll<HTMLButtonElement>(
    '.font-picker-group button',
  );
  expect(choices).toHaveLength(1);
  expect(choices[0].textContent).toBe('Arial');
  await act(async () => choices[0].click());
  expect(changed).toHaveBeenCalledWith('system:Arial');
  expect(document.querySelector('.font-picker-dialog')).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});
it('quotes system font names safely and preserves a portable fallback', () => {
  expect(fontFamily('system:Segoe UI')).toBe('"Segoe UI", Georgia, serif');
  const value = fontFamily('system:A";}</style><img>');
  expect(value).not.toContain('</style>');
  expect(value).not.toContain('";');
  expect(value).toContain('\\22 ');
  expect(fontFamily('system:')).toBe('Georgia, Charter, serif');
});
