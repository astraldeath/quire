import { expect, it } from 'vitest';
import { defaults, type Preferences } from '../src/domain/models';
import { createBackup, readBackup } from '../src/features/backup/archive';
import { validatePreferences } from '../src/features/backup/validation';
import { readerPreferences } from '../src/features/reader/customization';

const bookId = 'a'.repeat(64);
const fontId = `quire-font-${'b'.repeat(64)}`;
const preferences: Preferences = {
  ...defaults,
  reader: {
    ...defaults.reader,
    font: fontId,
    fontWeight: 650,
    linkColor: '#336699',
    tapZones: {
      left: 'none',
      center: 'controls',
      right: 'next',
      sideWidth: 25,
    },
    shortcuts: { next: 'n', prev: 'p', settings: 'Shift+S' },
    rsvpFocalColor: '#123456',
    rsvpGuides: true,
    rsvpFont: 'monospace',
    rsvpSize: 64,
    rsvpPunctuationMultiplier: 0.75,
    rsvpLongWordPauses: true,
    rsvpLongWordMultiplier: 2,
    rsvpLongWordLength: 10,
  },
  bookReaderOverrides: {
    [bookId]: { size: 28, rsvpFont: fontId, tapToTurn: false },
  },
  readingPresets: [
    {
      id: 'quiet',
      name: 'Quiet reading',
      settings: { ...defaults.reader, fontWeight: 500 },
    },
  ],
  readingThemes: [
    {
      id: 'paper',
      name: 'Paper',
      background: '#ffffff',
      foreground: '#111111',
      linkColor: '#2233aa',
    },
  ],
  customFonts: [
    {
      id: fontId,
      name: 'Imported reader',
      format: 'truetype',
      data: 'AAEAAA==',
    },
  ],
};

it('roundtrips all customization through a real backup while keeping overrides partial', async () => {
  const restored = (
    await readBackup(await createBackup([], preferences, 'data'))
  ).preferences;
  expect(restored.reader).toEqual(preferences.reader);
  expect(restored.bookReaderOverrides).toEqual({
    [bookId]: { size: 28, rsvpFont: fontId, tapToTurn: false },
  });
  expect(restored.readingPresets).toEqual(preferences.readingPresets);
  expect(restored.readingThemes).toEqual(preferences.readingThemes);
  expect(restored.customFonts).toEqual(preferences.customFonts);
  const updated = {
    ...restored,
    reader: { ...restored.reader, rsvpWpm: 500, size: 20 },
  };
  expect(readerPreferences(updated, bookId)).toMatchObject({
    rsvpWpm: 500,
    size: 28,
    rsvpFont: fontId,
  });
});

it('loads older backups without inventing book-specific customization', async () => {
  const restored = (await readBackup(await createBackup([], defaults, 'data')))
    .preferences;
  expect(restored.bookReaderOverrides).toBeUndefined();
  expect(restored.readingPresets).toBeUndefined();
  expect(restored.readingThemes).toBeUndefined();
  expect(restored.customFonts).toBeUndefined();
  expect(readerPreferences(restored, bookId)).toEqual(defaults.reader);
});

it.each([
  ['fontWeight', 99],
  ['fontWeight', 901],
  ['linkColor', 'red'],
  ['rsvpFocalColor', '#fff'],
  ['rsvpGuides', 'yes'],
  ['rsvpLongWordPauses', 1],
  ['rsvpSize', 23],
  ['rsvpSize', 97],
  ['rsvpPunctuationMultiplier', -1],
  ['rsvpPunctuationMultiplier', 4],
  ['rsvpLongWordMultiplier', 0],
  ['rsvpLongWordMultiplier', 4],
  ['rsvpLongWordLength', 3],
  ['rsvpLongWordLength', 21],
  ['rsvpFont', 'a'.repeat(201)],
  [
    'tapZones',
    { left: 'javascript', center: 'controls', right: 'next', sideWidth: 25 },
  ],
  [
    'tapZones',
    { left: 'prev', center: 'controls', right: 'next', sideWidth: 46 },
  ],
  ['shortcuts', { next: 'n'.repeat(51) }],
] as const)(
  'rejects invalid %s globally, in overrides, and in presets',
  (key, value) => {
    expect(() =>
      validatePreferences({
        ...defaults,
        reader: { ...defaults.reader, [key]: value },
      }),
    ).toThrow('invalid library data');
    expect(() =>
      validatePreferences({
        ...defaults,
        bookReaderOverrides: { [bookId]: { [key]: value } },
      }),
    ).toThrow('invalid library data');
    expect(() =>
      validatePreferences({
        ...defaults,
        readingPresets: [
          {
            id: 'bad',
            name: 'Bad',
            settings: { ...defaults.reader, [key]: value },
          },
        ],
      }),
    ).toThrow('invalid library data');
  },
);

it.each([
  { bookReaderOverrides: { 'not-a-book': { size: 24 } } },
  { bookReaderOverrides: { [bookId]: null } },
  {
    readingPresets: [
      preferences.readingPresets![0],
      preferences.readingPresets![0],
    ],
  },
  { readingThemes: [{ ...preferences.readingThemes![0], name: '  ' }] },
  {
    readingThemes: [
      {
        ...preferences.readingThemes![0],
        linkColor: 'url(https://remote.test)',
      },
    ],
  },
  { customFonts: [{ ...preferences.customFonts![0], id: 'unsafe-font' }] },
  { customFonts: [{ ...preferences.customFonts![0], data: 'AA==AA==' }] },
  { customFonts: [{ ...preferences.customFonts![0], data: 'AAAAA' }] },
  { customFonts: [{ ...preferences.customFonts![0], format: 'woff' }] },
  { customFonts: [preferences.customFonts![0], preferences.customFonts![0]] },
])('rejects invalid customization records %#', (invalid) => {
  expect(() => validatePreferences({ ...defaults, ...invalid })).toThrow(
    'invalid library data',
  );
});

it('bounds embedded font data across individual fonts and the complete backup', () => {
  expect(() =>
    validatePreferences({
      ...defaults,
      customFonts: [
        { ...preferences.customFonts![0], data: 'A'.repeat(5592412) },
      ],
    }),
  ).toThrow('invalid library data');
  const fonts = Array.from({ length: 4 }, (_, index) => ({
    ...preferences.customFonts![0],
    id: `quire-font-${index.toString(16).padStart(64, '0')}`,
    data: 'A'.repeat(5 * 1024 * 1024),
  }));
  expect(() =>
    validatePreferences({ ...defaults, customFonts: fonts }),
  ).toThrow('invalid library data');
});
