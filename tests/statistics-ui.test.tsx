import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Statistics } from '../src/features/statistics/Statistics';
const { records } = vi.hoisted(() => ({ records: { value: [] as any[] } }));
vi.mock('../src/storage', () => ({
  listReadingActivity: async () => records.value,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const book = {
  id: 'a'.repeat(64),
  title: 'One',
  author: '',
  series: 'Series',
  volume: 1,
  cover: '',
  addedAt: 1,
  local: false,
};
it('keeps library counts and one useful empty history action', async () => {
  records.value = [];
  const host = document.createElement('div');
  const root = createRoot(host);
  const go = vi.fn();
  await act(async () =>
    root.render(<Statistics books={[book]} onLibrary={go} />),
  );
  expect(
    host.querySelector('#statistics-library')?.parentElement?.textContent,
  ).toContain('Books1');
  expect(host.textContent?.match(/No reading history/g)).toHaveLength(1);
  expect(host.textContent).not.toContain('Not measured yet');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Go to library')!
      .click(),
  );
  expect(go).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
it('retains history for removed books, explains every history metric, and respects periods', async () => {
  const old = new Date('2020-01-01').getTime();
  records.value = [
    {
      id: 'x',
      bookId: 'removed',
      startedAt: old,
      endedAt: old + 60000,
      activeMs: 60000,
      words: 250,
      sampledMs: 60000,
      chapters: [1, 2],
      volume: 1,
      finished: true,
    },
  ];
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(<Statistics books={[]} onLibrary={() => {}} />),
  );
  expect(host.textContent).toContain('Chapters read2');
  expect(host.textContent).toContain('Volumes read1');
  expect(host.textContent).toContain('250');
  expect(host.querySelectorAll('button[aria-label^="About"]')).toHaveLength(4);
  expect(host.textContent).not.toContain('No reading history');
  const month = host.querySelector('input[value=month]') as HTMLInputElement;
  await act(async () => month.click());
  expect(host.textContent).toContain('No reading history for this period');
  await act(async () => root.unmount());
});
