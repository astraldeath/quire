import { expect, it } from 'vitest';
import {
  acquisitionFormat,
  catalogFilename,
  readCatalogResponse,
} from './transport';
it('offers only supported direct acquisitions', () => {
  expect(
    acquisitionFormat({
      url: 'https://books.test/book',
      title: '',
      type: 'application/epub+zip',
      rel: ['http://opds-spec.org/acquisition'],
    }),
  ).toBe('epub');
  expect(
    acquisitionFormat({
      url: 'https://books.test/book.epub',
      title: '',
      rel: ['http://opds-spec.org/acquisition/borrow'],
    }),
  ).toBeUndefined();
  expect(
    acquisitionFormat({
      url: 'https://books.test/book.epub',
      title: '',
      rel: ['http://opds-spec.org/acquisition'],
      indirect: true,
    }),
  ).toBeUndefined();
  expect(catalogFilename('A / book', 'pdf')).toBe('A _ book.pdf');
});
it('bounds streamed responses and rejects error pages before importing', async () => {
  await expect(
    readCatalogResponse(new Response('12345'), 4, new AbortController().signal),
  ).rejects.toThrow('too large');
  await expect(
    readCatalogResponse(
      new Response('no', { status: 401 }),
      100,
      new AbortController().signal,
    ),
  ).rejects.toThrow('credentials');
  expect(
    (
      await readCatalogResponse(
        new Response('abc'),
        4,
        new AbortController().signal,
      )
    ).size,
  ).toBe(3);
});
