import { expect, it } from 'vitest';
import { splitFocalWord } from './focal';

it.each([
  ['I', '', 'I', ''],
  ['word', 'w', 'o', 'rd'],
  ['reading', 're', 'a', 'ding'],
  ['recognition', 'rec', 'o', 'gnition'],
  ['characteristically', 'char', 'a', 'cteristically'],
  ['“word!”', '“w', 'o', 'rd!”'],
  ["can't", 'c', 'a', "n't"],
  ['a\u0301bc', 'a\u0301', 'b', 'c'],
  ['x👩‍👩‍👧‍👦y', 'x👩‍👩‍👧‍👦', 'y', ''],
  ['中文阅读', '中', '文', '阅读'],
  ['1234', '1', '2', '34'],
  ['…', '…', '', ''],
  ['', '', '', ''],
])(
  'keeps %s intact and chooses a letter independent of punctuation',
  (word, before, focal, after) => {
    expect(splitFocalWord(word)).toEqual({ before, focal, after });
    expect(before + focal + after).toBe(word);
  },
);
