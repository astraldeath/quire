import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ComicBookmarks } from '../src/features/reader/ComicBookmarks';
import type { ReaderToolsHandle } from '../src/features/reader/ReaderTools';
import type { Annotation, Book } from '../src/domain/models';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('keeps old comic bookmarks accessible and persists add/delete without dropping other annotations', async () => {
  const host = document.createElement('div'),
    toolbar = document.createElement('header');
  document.body.append(host, toolbar);
  const root = createRoot(host);
  const shortcuts = createRef<ReaderToolsHandle>();
  const old: Annotation = {
    id: 'old',
    kind: 'bookmark',
    cfi: 'epubcfi(/6/2!/4/2)',
    text: 'Cover',
    section: 'Page 1',
    note: '',
    createdAt: 1,
    updatedAt: 1,
  };
  const book: Book = {
    id: 'comic',
    format: 'cbz',
    title: 'Comic',
    author: '',
    series: '',
    volume: null,
    cover: '',
    local: true,
    addedAt: 1,
    annotations: [old],
  };
  const onSave = vi.fn().mockResolvedValue(undefined),
    navigate = vi.fn().mockResolvedValue(true);
  await act(async () =>
    root.render(
      <ComicBookmarks
        ref={shortcuts}
        book={book}
        position={{
          cfi: 'epubcfi(/6/6)',
          fraction: 0.5,
          section: 'Page 3',
          updatedAt: 2,
        }}
        count={5}
        toolbar={toolbar}
        visible
        otherPanelOpen={false}
        onOpen={() => {}}
        onSave={onSave}
        navigate={navigate}
      />,
    ),
  );
  const click = async (selector: string) => {
    await act(async () =>
      (document.querySelector(selector) as HTMLButtonElement).click(),
    );
  };
  await click('[aria-label="Bookmarks"]');
  await click('.annotation-jump');
  expect(navigate).toHaveBeenCalledWith(old.cfi);
  await click('[aria-label="Bookmarks"]');
  await click('.bookmark-current');
  expect(onSave.mock.lastCall?.[0]).toEqual([
    old,
    expect.objectContaining({ kind: 'bookmark', cfi: 'epubcfi(/6/6)' }),
  ]);
  await click('[aria-label="Delete bookmark"]');
  expect(onSave.mock.lastCall?.[0]).toEqual([
    expect.objectContaining({ cfi: 'epubcfi(/6/6)' }),
  ]);
  await act(async () => shortcuts.current?.close());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => shortcuts.current?.bookmark());
  expect(onSave.mock.lastCall?.[0]).toEqual([]);
  await act(async () => root.unmount());
  host.remove();
  toolbar.remove();
});
