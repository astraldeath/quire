import { expect, it } from 'vitest';
import { validatePreferences } from '../src/features/backup/validation';
import { defaults } from '../src/domain/models';
it('preserves comic choices in preference exports and restores defaults from older backups', () => {
  const reader = {
    ...defaults.reader,
    comicMode: 'webtoon',
    comicDirection: 'rtl',
    tapToTurn: false,
    swipeToTurn: true,
  };
  expect(validatePreferences({ ...defaults, reader }).reader).toMatchObject({
    comicMode: 'webtoon',
    comicDirection: 'rtl',
    tapToTurn: false,
    swipeToTurn: true,
  });
  expect(
    validatePreferences({
      ...defaults,
      reader: {
        ...defaults.reader,
        comicMode: undefined,
        comicDirection: undefined,
      },
    }).reader,
  ).toMatchObject({ comicMode: 'single', comicDirection: 'ltr' });
});
it('rejects unsupported comic preference values from imported data', () => {
  expect(() =>
    validatePreferences({
      ...defaults,
      reader: { ...defaults.reader, comicMode: 'arbitrary' },
    }),
  ).toThrow();
});
