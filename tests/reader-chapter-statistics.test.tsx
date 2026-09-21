import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Reader } from '../src/features/reader/Reader';
import { defaults } from '../src/domain/models';
import {
  aggregateStatistics,
  type ReadingActivity,
} from '../src/features/statistics/model';

vi.mock('../src/books', () => ({
  openBook: async () => ({
    publication: { sections: [], toc: [], destroy() {} },
    structure: {
      chapters: [1, 2].map((number, index) => ({
        number,
        hrefs: [`${index}.xhtml`],
        startSpineIndex: index,
        endSpineIndex: index,
      })),
    },
  }),
}));
vi.mock('foliate-js/view.js', () => {
  class MockView extends HTMLElement {
    isFixedLayout = false;
    renderer = Object.assign(document.createElement('div'), {
      atEnd: false,
      getContents: () => [],
      setStyles() {},
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
    }
    getCFI(index: number) {
      return `epubcfi(/6/${index * 2 + 2})`;
    }
    async next() {}
    async prev() {}
    close() {}
    clearSearch() {}
  }
  customElements.define('mock-statistics-view', MockView);
  return { View: MockView };
});
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it.each(['swipe', 'tap', 'jump'] as const)(
  'records chapter completion after %s navigation correctly',
  async (method) => {
    vi.useFakeTimers({
      toFake: ['performance', 'Date', 'setInterval', 'clearInterval'],
    });
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
    const records: ReadingActivity[] = [];
    try {
      await act(async () =>
        root.render(
          <Reader
            book={{
              id: 'a'.repeat(64),
              title: 'Book',
              author: '',
              series: '',
              volume: null,
              cover: '',
              addedAt: 0,
              local: true,
            }}
            bytes={new Uint8Array([1])}
            preferences={defaults.reader}
            onPreferences={() => {}}
            onPosition={() => {}}
            onAnnotations={async () => {}}
            onClose={() => {}}
            onActivity={(a) => records.push(a)}
          />,
        ),
      );
      const view = host.querySelector('mock-statistics-view') as HTMLElement & {
        renderer: HTMLElement;
        next(): Promise<void>;
      };
      const range = document.createRange();
      range.selectNodeContents(
        document.createTextNode('The last page of chapter one.'),
      );
      const relocate = (index: number, fraction: number, reason: string) =>
        view.renderer.dispatchEvent(
          new CustomEvent('relocate', {
            detail: { index, fraction, size: 0.1, reason, range },
          }),
        );
      await act(async () => {
        relocate(0, 0.9, 'anchor');
      });
      await act(async () => {
        vi.advanceTimersByTime(15000);
      });
      await act(async () => {
        if (method === 'tap') await view.next();
        if (method === 'swipe') relocate(0, 1, 'snap');
        relocate(1, 0, 'anchor');
      });
      await act(async () => root.unmount());
      expect(aggregateStatistics([], records).chapters).toBe(
        method === 'jump' ? 0 : 1,
      );
      expect(aggregateStatistics([], records).activeMs).toBe(15000);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);
