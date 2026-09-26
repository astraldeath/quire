import { File as NodeFile } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaults,
  type CustomFont,
  type Preferences,
} from '../../domain/models';
import {
  fontCss,
  fontFamily,
  importReadingFont,
  readerPreferences,
  resetBookReaderPreferences,
  setBookReaderPreferences,
} from './customization';

afterEach(() => vi.unstubAllGlobals());
const first = 'a'.repeat(64);
const second = 'b'.repeat(64);
const font: CustomFont = {
  id: `quire-font-${first}`,
  name: 'Reader font',
  format: 'truetype',
  data: 'AAEAAA==',
};

describe('per-book reading preferences', () => {
  it('keeps only changed fields and inherits subsequent global changes', () => {
    const original: Preferences = {
      ...defaults,
      bookReaderOverrides: { [second]: { size: 26 } },
    };
    const changed = setBookReaderPreferences(original, first, {
      ...readerPreferences(original, first),
      margin: 20,
    });
    expect(changed.bookReaderOverrides).toEqual({
      [first]: { margin: 20 },
      [second]: { size: 26 },
    });
    const updated = {
      ...changed,
      reader: { ...changed.reader, size: 28, margin: 50 },
    };
    expect(readerPreferences(updated, first)).toMatchObject({
      size: 28,
      margin: 20,
    });
    expect(readerPreferences(updated, second)).toMatchObject({
      size: 26,
      margin: 50,
    });
    expect(original.bookReaderOverrides).toEqual({ [second]: { size: 26 } });
    const reset = resetBookReaderPreferences(updated, first);
    expect(readerPreferences(reset, first)).toMatchObject({
      size: 28,
      margin: 50,
    });
    expect(reset.bookReaderOverrides).toEqual({ [second]: { size: 26 } });
  });

  it('clears the override when its values return to the global preferences', () => {
    const original = {
      ...defaults,
      bookReaderOverrides: { [first]: { size: 24 } },
    };
    expect(
      setBookReaderPreferences(original, first, { ...defaults.reader })
        .bookReaderOverrides,
    ).toEqual({});
  });

  it('does not pin migration defaults when saving one change to an older preference record', () => {
    const oldReader = { ...defaults.reader };
    delete oldReader.rsvpWpm;
    delete oldReader.rsvpPunctuationPauses;
    const original = { ...defaults, reader: oldReader };
    const changed = setBookReaderPreferences(original, first, {
      ...readerPreferences(original, first),
      size: 24,
    });
    expect(changed.bookReaderOverrides).toEqual({ [first]: { size: 24 } });
    expect(
      readerPreferences(
        { ...changed, reader: { ...oldReader, rsvpWpm: 450 } },
        first,
      ).rsvpWpm,
    ).toBe(450);
  });
});

describe('custom font boundaries', () => {
  it('emits only local font data and safely falls back for untrusted family names', () => {
    const css = fontCss([
      font,
      { ...font, id: 'bad";src:url(https://remote.test/a)' },
      { ...font, data: '");} @import url(https://remote.test/a);' },
    ]);
    expect(css.match(/@font-face/g)).toHaveLength(1);
    expect(css).toContain('data:font/ttf;base64,AAEAAA==');
    expect(css).not.toContain('remote.test');
    expect(fontFamily('bad";color:red')).toBe('Georgia, Charter, serif');
    expect(fontFamily(font.id)).toBe(`"${font.id}", Georgia, serif`);
    expect(fontFamily('publisher')).toBe('inherit');
  });

  const file = (bytes = [0, 1, 0, 0], name = 'Reading.TTF') =>
    new NodeFile([new Uint8Array(bytes)], name) as unknown as File;
  const loadFont = (reject = false) => {
    vi.stubGlobal(
      'FontFace',
      class {
        load() {
          return reject
            ? Promise.reject(new Error('Bad font tables'))
            : Promise.resolve(this);
        }
      },
    );
  };

  it('imports decoded bytes and deduplicates the same font under another filename', async () => {
    loadFont();
    const imported = await importReadingFont(file(), []);
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      name: 'Reading',
      format: 'truetype',
      data: 'AAEAAA==',
    });
    expect(imported[0].id).toMatch(/^quire-font-[a-f0-9]{64}$/);
    loadFont(true);
    expect(
      await importReadingFont(file(undefined, 'Renamed.ttf'), imported),
    ).toBe(imported);
    loadFont();
    const extended = await importReadingFont(
      file([79, 84, 84, 79], 'Other.otf'),
      imported,
    );
    expect(extended).toHaveLength(2);
    expect(extended[1]).toMatchObject({
      name: 'Other',
      format: 'opentype',
      data: 'T1RUTw==',
    });
    expect(extended[1].id).not.toBe(imported[0].id);
  });

  it('does not retain a file the browser cannot decode as a font', async () => {
    loadFont(true);
    const existing = [font];
    await expect(
      importReadingFont(file([79, 84, 84, 79]), existing),
    ).rejects.toThrow('could not be opened');
    expect(existing).toEqual([font]);
  });

  it('rejects unsupported extensions, invalid signatures and oversized files', async () => {
    await expect(
      importReadingFont(file(undefined, 'font.woff2'), []),
    ).rejects.toThrow('TTF or OTF');
    await expect(importReadingFont(file([1, 2, 3, 4]), [])).rejects.toThrow(
      'not a supported font',
    );
    const oversized = new NodeFile(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      'font.ttf',
    ) as unknown as File;
    await expect(importReadingFont(oversized, [])).rejects.toThrow(
      'smaller than 4 MiB',
    );
  });

  it('enforces the font count before decoding another font', async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      ...font,
      id: `quire-font-${i.toString(16).padStart(64, '0')}`,
    }));
    await expect(importReadingFont(file(), existing)).rejects.toThrow(
      'Remove an unused custom font',
    );
  });

  it('enforces the combined embedded font limit before decoding another font', async () => {
    const existing = [{ ...font, data: 'A'.repeat(16 * 1024 * 1024) }];
    await expect(importReadingFont(file(), existing)).rejects.toThrow(
      'Remove an unused custom font',
    );
  });
});
