import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Reader } from '../src/features/reader/Reader';
import { defaults, type Book } from '../src/domain/models';
import { View } from 'foliate-js/view.js';

vi.mock('../src/books', () => ({
  openBook: async () => ({
    publication: { sections: [], toc: [], destroy() {} },
    structure: { chapters: [] },
  }),
}));
vi.mock('foliate-js/view.js', () => {
  class MockView extends HTMLElement {
    isFixedLayout = true;
    renderer = Object.assign(document.createElement('div'), {
      atEnd: false,
      getContents: () => [],
    });
    async open() {}
    async init() {
      this.dispatchEvent(
        new CustomEvent('load', {
          detail: {
            doc: document.implementation.createHTMLDocument(),
            index: 0,
          },
        }),
      );
      this.dispatchEvent(
        new CustomEvent('relocate', {
          detail: {
            cfi: 'epubcfi(/6/2)',
            fraction: 1 / 3,
            section: { current: 0 },
            tocItem: { label: 'Page 1' },
            range: null,
          },
        }),
      );
    }
    async next() {}
    async prev() {}
    close() {}
    clearSearch() {}
  }
  customElements.define('mock-fixed-bookmark-view', MockView);
  return { View: MockView };
});
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it('bookmarks the exact live fixed page while parent position persistence lags', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onPosition = vi.fn();
  const book: Book = {
    id: 'fixed',
    title: 'Fixed',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: true,
  };
  try {
    await act(async () =>
      root.render(
        <Reader
          book={book}
          bytes={new Uint8Array([1])}
          preferences={defaults.reader}
          onPreferences={() => {}}
          onPosition={onPosition}
          onAnnotations={onSave}
          onClose={() => {}}
        />,
      ),
    );
    const view = host.querySelector('mock-fixed-bookmark-view') as View;
    expect(onPosition).toHaveBeenCalled();
    await act(async () => {
      view.dispatchEvent(
        new CustomEvent('relocate', {
          detail: {
            cfi: 'epubcfi(/6/6)',
            fraction: 1,
            section: { current: 2 },
            tocItem: { label: 'Page 3' },
            range: null,
          },
        }),
      );
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await act(async () =>
      (
        host.querySelector('[aria-label="Bookmarks"]') as HTMLButtonElement
      ).click(),
    );
    expect(document.body.textContent).not.toContain('Select text to highlight');
    expect(document.body.textContent).toContain('No bookmarks.');
    const add = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Bookmark this page',
    )!;
    expect(add.disabled).toBe(false);
    await act(async () => add.click());
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'bookmark',
        cfi: 'epubcfi(/6/6)',
        section: 'Page 3',
      }),
    ]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
