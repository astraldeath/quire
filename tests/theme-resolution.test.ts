import { expect, it } from 'vitest';
import { resolveReaderTheme } from '../src/features/reader/theme';
import { defaults } from '../src/domain/models';
it('uses pure black and white for explicit and inherited Contrast', () => {
  expect(
    resolveReaderTheme(
      { ...defaults.reader, theme: 'contrast' },
      'light',
      false,
    ),
  ).toMatchObject({
    background: '#000000',
    foreground: '#ffffff',
    contrast: true,
  });
  expect(resolveReaderTheme(defaults.reader, 'contrast', false)).toMatchObject({
    background: '#000000',
    foreground: '#ffffff',
    contrast: true,
  });
});
it('keeps reader overrides independent and follows the system when requested', () => {
  expect(
    resolveReaderTheme({ ...defaults.reader, theme: 'light' }, 'contrast', true)
      .contrast,
  ).toBe(false);
  expect(resolveReaderTheme(defaults.reader, 'system', true).background).toBe(
    '#171819',
  );
  expect(resolveReaderTheme(defaults.reader, 'system', false).background).toBe(
    '#faf9f6',
  );
});
