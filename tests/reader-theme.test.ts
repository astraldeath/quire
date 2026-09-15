import { expect, it } from 'vitest';
import { defaults } from '../src/domain/models';
import {
  readerThemeCss,
  resolveReaderTheme,
} from '../src/features/reader/theme';
it('dark theme overrides explicit heading/span colors while excluding SVG art', () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML =
    '<h1 style="color:black">Title <span style="color:black">subtitle</span></h1><svg><text>Art</text><path/></svg><img/>';
  const style = document.createElement('style');
  style.textContent = readerThemeCss('#eeeeee', '#171819');
  document.head.append(style);
  const rule = style.sheet!.cssRules[1] as CSSStyleRule;
  expect(doc.querySelector('h1')!.matches(rule.selectorText)).toBe(true);
  expect(doc.querySelector('span')!.matches(rule.selectorText)).toBe(true);
  expect(doc.querySelector('svg text')!.matches(rule.selectorText)).toBe(false);
  expect(doc.querySelector('img')!.matches(rule.selectorText)).toBe(false);
  expect(rule.style.getPropertyValue('color')).toBe('rgb(238, 238, 238)');
  expect(rule.style.getPropertyPriority('color')).toBe('important');
  style.remove();
});

it('Onyx stays black with soft text, including Follow app, without enabling Contrast', () => {
  const expected = {
    background: '#000000',
    foreground: '#d6d6d6',
    contrast: false,
    dark: true,
  };
  expect(
    resolveReaderTheme({ ...defaults.reader, theme: 'onyx' }, 'light'),
  ).toEqual(expected);
  expect(
    resolveReaderTheme({ ...defaults.reader, theme: 'app' }, 'onyx', true),
  ).toEqual(expected);
  expect(
    resolveReaderTheme({ ...defaults.reader, theme: 'contrast' }, 'onyx')
      .foreground,
  ).toBe('#ffffff');
  expect(
    resolveReaderTheme({ ...defaults.reader, theme: 'light' }, 'onyx')
      .background,
  ).toBe('#faf9f6');
});

it('Follow app uses custom app colors without replacing independent reader colors', () => {
  const colors = { background: '#102030', foreground: '#e0d0c0' };
  expect(
    resolveReaderTheme(defaults.reader, 'custom', false, colors),
  ).toMatchObject(colors);
  expect(
    resolveReaderTheme(
      { ...defaults.reader, theme: 'custom' },
      'custom',
      false,
      colors,
    ).background,
  ).toBe(defaults.reader.background);
});
