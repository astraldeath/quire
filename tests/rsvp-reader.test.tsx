import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, it, expect, vi } from 'vitest';
import { RsvpReader } from '../src/features/reader/rsvp/RsvpReader';
import { defaults } from '../src/domain/models';
import { validatePreferences } from '../src/features/backup/validation';
import { supportsRsvp } from '../src/features/reader/rsvp/publication';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const publication = {
  sections: [
    {
      id: 'one',
      size: 100,
      load: () => '',
      createDocument: () =>
        new DOMParser().parseFromString(
          '<p>One two. Three four.</p>',
          'text/html',
        ),
    },
  ],
  destroy() {},
};
const locator = {
  getCFI: (_: number, range?: Range) => `word:${range?.startOffset}`,
  resolveNavigation: () => ({
    index: 0,
    anchor: (doc: Document) => {
      const range = doc.createRange();
      range.setStart(doc.querySelector('p')!.firstChild!, 4);
      range.collapse(true);
      return range;
    },
  }),
};
it('restores old preferences and rejects invalid RSVP backup data', () => {
  const old = {
    ...defaults,
    reader: {
      ...defaults.reader,
      rsvpWpm: undefined,
      rsvpPunctuationPauses: undefined,
    },
  };
  expect(validatePreferences(old).reader.rsvpWpm).toBe(250);
  expect(validatePreferences(old).reader.rsvpPunctuationPauses).toBe(true);
  expect(() =>
    validatePreferences({ ...old, reader: { ...old.reader, rsvpWpm: 1001 } }),
  ).toThrow();
  expect(supportsRsvp(publication)).toBe(true);
  expect(supportsRsvp(publication, 'pdf')).toBe(false);
  expect(
    supportsRsvp({ ...publication, rendition: { layout: 'pre-paginated' } }),
  ).toBe(false);
});
it('starts at current CFI paused, pauses for background cover, and exits at visible word', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPosition = vi.fn();
  const onExit = vi.fn();
  const onActivity = vi.fn();
  await act(async () =>
    root.render(
      <RsvpReader
        bookId={'a'.repeat(64)}
        volume={null}
        publication={publication}
        locator={locator}
        structure={{
          chapters: [
            {
              number: 3,
              label: 'Chapter 3',
              hrefs: [],
              startSpineIndex: 0,
              endSpineIndex: 0,
            },
          ],
        }}
        position={{ cfi: 'saved', fraction: 0.2, section: '', updatedAt: 1 }}
        preferences={{ ...defaults.reader, rsvpPunctuationPauses: false }}
        onPreferences={vi.fn()}
        onPosition={onPosition}
        onActivity={onActivity}
        onExit={onExit}
      />,
    ),
  );
  expect(host.querySelector('.rsvp-word')?.textContent).toBe('two.');
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.querySelector('.rsvp-word')?.textContent).toBe('two.');
  await act(async () =>
    (host.querySelector('[aria-label="Play"]') as HTMLButtonElement).click(),
  );
  await act(async () => vi.advanceTimersByTime(240));
  expect(host.querySelector('.rsvp-word')?.textContent).toBe('Three');
  await act(async () => {
    const cover = document.createElement('div');
    cover.className = 'privacy-cover';
    document.body.append(cover);
  });
  expect(host.querySelector('[aria-label="Play"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.querySelector('.rsvp-word')?.textContent).toBe('Three');
  await act(async () =>
    (
      host.querySelector('[aria-label="Back to page"]') as HTMLButtonElement
    ).click(),
  );
  expect(onExit).toHaveBeenCalledWith(
    expect.objectContaining({ cfi: 'word:9' }),
  );
  expect(
    onActivity.mock.calls.every(([a]) => a.words === 0 && a.sampledMs === 0),
  ).toBe(true);
  await act(async () => root.unmount());
});
it('cancels a pending next section when returning to the page', async () => {
  vi.useFakeTimers();
  let resolve!: (doc: Document) => void;
  const delayed = {
    ...publication,
    sections: [
      publication.sections[0],
      {
        ...publication.sections[0],
        createDocument: () =>
          new Promise<Document>((r) => {
            resolve = r;
          }),
      },
    ],
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPosition = vi.fn();
  const onExit = vi.fn();
  await act(async () =>
    root.render(
      <RsvpReader
        bookId={'a'.repeat(64)}
        volume={null}
        publication={delayed}
        locator={locator}
        structure={{ chapters: [] }}
        preferences={{ ...defaults.reader, rsvpPunctuationPauses: false }}
        onPreferences={vi.fn()}
        onPosition={onPosition}
        onExit={onExit}
      />,
    ),
  );
  await act(async () =>
    (host.querySelector('[aria-label="Play"]') as HTMLButtonElement).click(),
  );
  await act(async () => vi.advanceTimersByTime(960));
  expect(host.textContent).toContain('Loading text');
  await act(async () =>
    (
      host.querySelector('[aria-label="Back to page"]') as HTMLButtonElement
    ).click(),
  );
  const saves = onPosition.mock.calls.length;
  await act(async () =>
    resolve(
      new DOMParser().parseFromString('<p>Late chapter</p>', 'text/html'),
    ),
  );
  expect(onPosition).toHaveBeenCalledTimes(saves);
  expect(host.querySelector('.rsvp-word')?.textContent).toBe('four.');
  await act(async () => root.unmount());
});
it('completes chapters only after final dwell and does not duplicate replay', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onActivity = vi.fn();
  const onPosition = vi.fn();
  await act(async () =>
    root.render(
      <RsvpReader
        bookId={'a'.repeat(64)}
        volume={null}
        publication={publication}
        locator={locator}
        structure={{
          chapters: [
            {
              number: 7,
              label: 'Chapter 7',
              hrefs: [],
              startSpineIndex: 0,
              endSpineIndex: 0,
            },
          ],
        }}
        preferences={{ ...defaults.reader, rsvpPunctuationPauses: false }}
        onPreferences={vi.fn()}
        onPosition={onPosition}
        onActivity={onActivity}
        onExit={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    (host.querySelector('[aria-label="Play"]') as HTMLButtonElement).click(),
  );
  await act(async () => vi.advanceTimersByTime(959));
  expect(onActivity.mock.calls.flatMap(([a]) => a.chapters)).toEqual([]);
  await act(async () => vi.advanceTimersByTime(1));
  expect(onActivity.mock.calls.flatMap(([a]) => a.chapters)).toEqual([7]);
  expect(onPosition.mock.lastCall?.[0]).toMatchObject({
    fraction: 1,
    completedChapter: 7,
  });
  await act(async () =>
    (
      host.querySelector('[aria-label="Rewind sentence"]') as HTMLButtonElement
    ).click(),
  );
  await act(async () =>
    (host.querySelector('[aria-label="Play"]') as HTMLButtonElement).click(),
  );
  await act(async () => vi.advanceTimersByTime(480));
  expect(onActivity.mock.calls.flatMap(([a]) => a.chapters)).toEqual([7]);
  await act(async () => root.unmount());
});
