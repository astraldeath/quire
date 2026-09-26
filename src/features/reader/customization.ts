import {
  defaults,
  type Preferences,
  type ReaderPreferences,
  type CustomFont,
} from '../../domain/models';
import { resolvedShortcuts, resolvedTapZones } from './control-mapping';

export function readerPreferences(
  preferences: Preferences,
  bookId: string,
): ReaderPreferences {
  return {
    ...defaults.reader,
    ...preferences.reader,
    ...preferences.bookReaderOverrides?.[bookId],
  };
}

// Give omitted optional fields their runtime meaning when applying an older preset.
function completeReaderPreferences(p: ReaderPreferences): ReaderPreferences {
  return {
    ...defaults.reader,
    fontWeight: 400,
    linkColor: p.foreground,
    rsvpFocalColor: '#cf5563',
    rsvpGuides: false,
    rsvpFont: 'Georgia',
    rsvpSize: 40,
    rsvpPunctuationMultiplier: 1,
    rsvpLongWordPauses: false,
    rsvpLongWordMultiplier: 1.5,
    rsvpLongWordLength: 8,
    ...p,
    tapZones: resolvedTapZones(p),
    shortcuts: resolvedShortcuts(p),
  };
}

/** Store only differences, so unmodified fields continue following the defaults. */
export function setBookReaderPreferences(
  preferences: Preferences,
  bookId: string,
  next: ReaderPreferences,
): Preferences {
  const overrides: Partial<ReaderPreferences> = {};
  const global = completeReaderPreferences(preferences.reader);
  next = completeReaderPreferences(next);
  for (const key of Object.keys(next) as (keyof ReaderPreferences)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(global[key]))
      Object.assign(overrides, { [key]: next[key] });
  }
  const bookReaderOverrides = { ...preferences.bookReaderOverrides };
  if (Object.keys(overrides).length) bookReaderOverrides[bookId] = overrides;
  else delete bookReaderOverrides[bookId];
  return { ...preferences, bookReaderOverrides };
}

export function resetBookReaderPreferences(
  preferences: Preferences,
  bookId: string,
): Preferences {
  const bookReaderOverrides = { ...preferences.bookReaderOverrides };
  delete bookReaderOverrides[bookId];
  return { ...preferences, bookReaderOverrides };
}

// Escape every unsafe code point inside a quoted CSS family name.
const quoteFamily = (name: string) =>
  '"' +
  Array.from(name, (c) =>
    /[a-zA-Z0-9 _-]/.test(c) ? c : '\\' + c.codePointAt(0)!.toString(16) + ' ',
  ).join('') +
  '"';
export const fontFamily = (font: string) =>
  font.startsWith('system:') && font.length > 7 && font.length <= 187
    ? `${quoteFamily(font.slice(7))}, Georgia, serif`
    : font === 'monospace'
      ? 'monospace'
      : /^quire-font-[a-f0-9]{64}$/.test(font)
        ? `"${font}", Georgia, serif`
        : font === 'sans-serif'
          ? 'system-ui, sans-serif'
          : font === 'publisher'
            ? 'inherit'
            : 'Georgia, Charter, serif';

export function fontCss(fonts: CustomFont[] = []): string {
  return fonts
    .filter(
      (font) =>
        /^quire-font-[a-f0-9]{64}$/.test(font.id) &&
        /^[A-Za-z0-9+/=]+$/.test(font.data),
    )
    .map(
      (font) =>
        `@font-face { font-family: "${font.id}"; src: url("data:font/${font.format === 'opentype' ? 'otf' : 'ttf'};base64,${font.data}"); font-weight: 100 900; font-display: swap; }`,
    )
    .join('\n');
}

export async function importReadingFont(
  file: File,
  existing: CustomFont[],
): Promise<CustomFont[]> {
  if (!/\.(ttf|otf)$/i.test(file.name))
    throw new Error('Choose a TTF or OTF font.');
  if (file.size > 4 * 1024 * 1024)
    throw new Error('Choose a font smaller than 4 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = [...bytes.slice(0, 4)].join(',');
  const format =
    signature === '79,84,84,79'
      ? 'opentype'
      : signature === '0,1,0,0' || signature === '116,114,117,101'
        ? 'truetype'
        : null;
  if (!format) throw new Error('This file is not a supported font.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const id =
    'quire-font-' +
    [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (existing.some((f) => f.id === id)) return existing;
  if (
    existing.length >= 20 ||
    existing.reduce((size, f) => size + f.data.length, 0) +
      (file.size * 4) / 3 >
      16 * 1024 * 1024
  )
    throw new Error('Remove an unused custom font before importing another.');
  const face = new FontFace(id, bytes.buffer);
  try {
    await face.load();
  } catch {
    throw new Error('This font could not be opened.');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return [
    ...existing,
    {
      id,
      name: file.name.replace(/\.(ttf|otf)$/i, '').slice(0, 100),
      format,
      data: btoa(binary),
    },
  ];
}
