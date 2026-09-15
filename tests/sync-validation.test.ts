import { it, expect } from 'vitest';
import { validateResponse } from '../src/features/sync/validation';
import { serverOrigin } from '../src/features/sync/transport';
it('rejects invalid remote data before advancing cursors or applying notes', () => {
  const good = { results: [], changes: [], cursor: 0, hasMore: false };
  expect(validateResponse(good, 0, [])).toEqual(good);
  for (const bad of [
    { ...good, cursor: 1 },
    { ...good, hasMore: true },
    { ...good, results: [{ id: 'unknown', revision: 1, conflict: false }] },
    { ...good, changes: [{ bookId: '../private', cursor: 1 }] },
  ])
    expect(() => validateResponse(bad, 0, [])).toThrow();
});
it('requires secure origins and rejects embedded credentials or redirected paths', () => {
  expect(serverOrigin('https://books.example')).toBe('https://books.example');
  expect(serverOrigin('http://localhost:8080')).toBe('http://localhost:8080');
  for (const url of [
    'http://books.example',
    'https://u:p@books.example',
    'https://books.example/path',
    'file:///x',
  ])
    expect(() => serverOrigin(url)).toThrow();
});
it('accepts locationless manual completion but requires locations for partial progress and annotations', () => {
  const response = (kind: string, value: unknown) => ({
    results: [],
    changes: [
      {
        bookId: 'a'.repeat(64),
        kind,
        recordId: 'default',
        revision: 1,
        cursor: 1,
        candidates: [
          { operationId: 'op', createdAt: 1, deleted: false, value },
        ],
      },
    ],
    cursor: 1,
    hasMore: false,
  });
  const completed = response('position', { cfi: '', fraction: 1, section: '' });
  expect(validateResponse(completed, 0, [])).toEqual(completed);
  for (const fraction of [0, 0.5, 0.999])
    expect(() =>
      validateResponse(response('position', { cfi: '', fraction }), 0, []),
    ).toThrow();
  expect(() =>
    validateResponse(
      response('annotation', { kind: 'highlight', cfi: '', text: 'word' }),
      0,
      [],
    ),
  ).toThrow();
});
