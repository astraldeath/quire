import { describe, expect, it } from 'vitest';
import { tokenizeRsvp, tokenRange, tokenAtRange } from './tokens';
const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');
describe('RSVP tokens', () => {
  it('joins inline fragments and excludes hidden, navigation and ruby readings', () => {
    const doc = parse(
      '<p>Hel<em>lo</em> <ruby>world<rt>pronunciation</rt><rp>(</rp></ruby>.<span hidden>hidden</span><i aria-hidden="true">hidden</i><span style="display:none">hidden</span></p><nav>contents</nav><script>bad</script><p><img alt="not prose"></p>',
    );
    const tokens = tokenizeRsvp(doc);
    expect(tokens.map((t) => t.text)).toEqual(['Hello', 'world.']);
    expect(tokenRange(tokens[0]).toString()).toBe('Hello');
    expect(tokenAtRange(tokens, tokenRange(tokens[1]))).toBe(1);
    expect(tokens[1].paragraphEnd).toBe(true);
  });
  it('keeps combining glyphs, emoji and CJK word boundaries', () => {
    const tokens = tokenizeRsvp(parse('<p>Café 👩‍👩‍👧‍👧 中文阅读。</p>'), 'zh');
    expect(tokens[0].text).toBe('Café');
    expect(tokens.some((t) => t.text.includes('👩‍👩‍👧‍👧'))).toBe(true);
    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens.map((t) => t.text).join('')).toBe('Café👩‍👩‍👧‍👧中文阅读。');
  });
  it('filters embedded CSS hidden descendants and maintains sentences', () => {
    const tokens = tokenizeRsvp(
      parse(
        '<style>.hidden { display: none }</style><p>One. Two!</p><div class="hidden"><p>Secret</p></div><p>Three</p>',
      ),
    );
    expect(tokens.map((t) => t.text)).toEqual(['One.', 'Two!', 'Three']);
    expect(tokens.map((t) => t.sentence)).toEqual([0, 1, 2]);
  });
  it('has a Unicode safe fallback without Segmenter', () => {
    const original = Intl.Segmenter;
    Object.defineProperty(Intl, 'Segmenter', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(tokenizeRsvp(parse('<p>Café 👩‍👩‍👧‍👧</p>')).map((t) => t.text)).toEqual([
        'Café',
        '👩‍👩‍👧‍👧',
      ]);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', {
        value: original,
        configurable: true,
      });
    }
  });
});
it('preserves abbreviations during sentence rewind segmentation', () => {
  const tokens = tokenizeRsvp(
    parse('<p>Dr. Smith said hello. Next sentence.</p>'),
    'en',
  );
  expect(tokens[0].sentence).toBe(tokens[1].sentence);
  expect(tokens.find((t) => t.text === 'Next')!.sentence).toBe(
    tokens[0].sentence + 1,
  );
});
it('does not merge spaced punctuation into the preceding word range', () => {
  const tokens = tokenizeRsvp(parse('<p>Hello — world!</p>'));
  expect(tokens.map((t) => t.text)).toEqual(['Hello', 'world!']);
  expect(tokenRange(tokens[1]).toString()).toBe('world!');
});
it.each([
  '.x { display:none }.x { display:block }',
  '@media print { .x { display:none } }',
  '.x { visibility:hidden }.x { visibility:visible }',
])('preserves screen prose for visibility overrides: %s', (css) => {
  expect(
    tokenizeRsvp(
      parse(`<style>${css}</style><p class="x">Visible prose</p>`),
    ).map((t) => t.text),
  ).toEqual(['Visible', 'prose']);
});
it('honors style element media and preserves inline visible overrides', () => {
  expect(
    tokenizeRsvp(
      parse('<style media="print">p{display:none}</style><p>Visible</p>'),
    ).map((t) => t.text),
  ).toEqual(['Visible']);
  expect(
    tokenizeRsvp(
      parse(
        '<style>.x{display:none}</style><p class="x" style="display:block">Visible</p>',
      ),
    ).map((t) => t.text),
  ).toEqual(['Visible']);
});
