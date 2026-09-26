import { File as NodeFile } from 'node:buffer';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { View } from 'foliate-js/view.js';
import {
  defaults,
  type CustomFont,
  type Preferences,
} from '../src/domain/models';
import { CustomFontSettings } from '../src/features/reader/ReadingCustomization';
import { applyReaderPreferences } from '../src/features/reader/Reader';

vi.mock('foliate-js/view.js', () => ({ View: class {} }));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

const font = (letter: string): CustomFont => ({
  id: `quire-font-${letter.repeat(64)}`,
  name: `Font ${letter}`,
  data: 'AAEAAA==',
  format: 'truetype',
});

it('merges an asynchronous font import into the latest preferences without restoring removed fonts', async () => {
  let release!: () => void;
  let loading!: () => void;
  const started = new Promise<void>((resolve) => {
    loading = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'FontFace',
    class {
      load() {
        loading();
        return pending;
      }
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current: Preferences = { ...defaults, customFonts: [font('a')] };
  const render = () =>
    root.render(
      <CustomFontSettings
        customization={{
          bookId: 'c'.repeat(64),
          preferences: current,
          onChange(next) {
            current = typeof next === 'function' ? next(current) : next;
            render();
          },
        }}
      />,
    );
  try {
    await act(async () => render());
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new NodeFile(
      [new Uint8Array([79, 84, 84, 79])],
      'Imported.otf',
    );
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await started;
    });
    expect(input.disabled).toBe(true);
    current = {
      ...current,
      theme: 'dark',
      reader: { ...current.reader, size: 30 },
      customFonts: [font('b')],
      bookReaderOverrides: { ['c'.repeat(64)]: { margin: 16 } },
    };
    await act(async () => render());
    await act(async () => release());
    expect(current.theme).toBe('dark');
    expect(current.reader.size).toBe(30);
    expect(current.bookReaderOverrides).toEqual({
      ['c'.repeat(64)]: { margin: 16 },
    });
    expect(current.customFonts).toHaveLength(2);
    expect(current.customFonts?.map((entry) => entry.name)).toEqual([
      'Font b',
      'Imported',
    ]);
    expect(current.customFonts?.[1]).toMatchObject({
      data: 'T1RUTw==',
      format: 'opentype',
    });
    expect(input.disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    release();
    await act(async () => root.unmount());
    host.remove();
  }
});

function rendererStyles(fixed = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const sheet = document.createElement('style');
  document.head.append(sheet);
  const renderer = Object.assign(document.createElement('div'), {
    setStyles(css: string) {
      sheet.textContent = css;
    },
  });
  const view = {
    renderer,
    isFixedLayout: fixed,
    clientWidth: 800,
  } as unknown as View;
  const rule = (selector: string) => {
    const found = Array.from(sheet.sheet?.cssRules ?? []).find(
      (entry) =>
        entry instanceof CSSStyleRule && entry.selectorText === selector,
    );
    if (!(found instanceof CSSStyleRule))
      throw new Error(`Missing stylesheet rule for ${selector}`);
    return found.style;
  };
  return { renderer, view, sheet, rule };
}

it('sends only the selected font to the book and inherits chosen weight into prose blocks', () => {
  const { view, sheet, rule } = rendererStyles();
  try {
    applyReaderPreferences(
      view,
      {
        ...defaults.reader,
        font: font('a').id,
        fontWeight: 650,
        theme: 'custom',
        foreground: '#112233',
        background: '#ffffff',
        linkColor: '#556677',
      },
      [font('a'), font('b')],
    );
    expect(sheet.textContent).toContain('data:font/ttf;base64,AAEAAA==');
    expect(sheet.textContent).toContain(font('a').id);
    expect(sheet.textContent).not.toContain(font('b').id);
    expect(rule('body').getPropertyValue('font-family')).toBe(
      `"${font('a').id}", Georgia, serif`,
    );
    expect(rule('body').getPropertyValue('font-weight')).toBe('650');
    expect(rule('body').getPropertyPriority('font-weight')).toBe('important');
    expect(rule('p, li, div').getPropertyValue('font-weight')).toBe('inherit');
    expect(rule('p, li, div').getPropertyPriority('font-weight')).toBe(
      'important',
    );
    expect(rule('a, a *').getPropertyValue('color')).toBe('rgb(85, 102, 119)');
    expect(rule('a, a *').getPropertyPriority('color')).toBe('important');
  } finally {
    sheet.remove();
  }
});

it('leaves publisher typography in control when requested and rejects injected link colors', () => {
  const { view, sheet, rule } = rendererStyles();
  try {
    applyReaderPreferences(
      view,
      {
        ...defaults.reader,
        font: 'publisher',
        publisherStyles: true,
        theme: 'custom',
        foreground: '#112233',
        linkColor: 'red; } body { display: none',
      },
      [font('a')],
    );
    expect(rule('body').getPropertyValue('font-family')).toBe('');
    expect(rule('body').getPropertyValue('font-weight')).toBe('');
    expect(
      Array.from(sheet.sheet?.cssRules ?? []).some(
        (entry) =>
          entry instanceof CSSStyleRule && entry.selectorText === 'p, li, div',
      ),
    ).toBe(false);
    expect(rule('a, a *').getPropertyValue('color')).toBe('rgb(17, 34, 51)');
    expect(sheet.textContent).not.toContain('display: none');
    expect(sheet.textContent).not.toContain('@font-face');
  } finally {
    sheet.remove();
  }
});

it('does not inject custom fonts or typography into fixed-layout books', () => {
  const { renderer, view, sheet } = rendererStyles(true);
  try {
    applyReaderPreferences(
      view,
      {
        ...defaults.reader,
        font: font('a').id,
        fontWeight: 650,
        theme: 'custom',
        linkColor: '#556677',
        size: 32,
      },
      [font('a')],
    );
    expect(sheet.textContent).toBe('');
    expect(renderer.getAttribute('zoom')).toBe('fit-page');
    expect(renderer.hasAttribute('flow')).toBe(false);
  } finally {
    sheet.remove();
  }
});
