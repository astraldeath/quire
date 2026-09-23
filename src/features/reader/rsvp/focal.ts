const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined;

export function splitFocalWord(word: string) {
  const letters = segmenter
    ? Array.from(segmenter.segment(word), (part) => part.segment)
    : Array.from(word.normalize('NFC'));
  const candidates = letters.flatMap((letter, index) =>
    /[\p{L}\p{N}]/u.test(letter) ? [index] : [],
  );
  if (!candidates.length) return { before: word, focal: '', after: '' };
  // Keep the recognition point near the start, moving right for longer words.
  const length = candidates.length;
  const position =
    length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4;
  const index = candidates[position];
  return {
    before: letters.slice(0, index).join(''),
    focal: letters[index],
    after: letters.slice(index + 1).join(''),
  };
}
