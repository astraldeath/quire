import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Reader } from '../src/features/reader/Reader';
import { defaults } from '../src/domain/models';
const state = vi.hoisted(() => ({
  fail: false,
  opens: 0,
  pending: null as Promise<void> | null,
  destroy: vi.fn(),
}));
vi.mock('../src/books', () => ({
  openBook: async () => {
    state.opens++;
    if (state.pending) await state.pending;
    if (state.fail) throw new Error('Fixture load failed');
    return {
      publication: { sections: [], toc: [], destroy: state.destroy },
      structure: { chapters: [] },
    };
  },
}));
vi.mock('foliate-js/view.js', () => {
  class MockView extends HTMLElement {
    isFixedLayout = false;
    renderer = Object.assign(document.createElement('div'), {
      atEnd: false,
      getContents: () => [],
      setStyles() {},
      goTo: async (target: unknown) => this.relocate(String(target), 0.2),
    });
    relocate(cfi: string, fraction: number) {
      this.dispatchEvent(
        new CustomEvent('relocate', { detail: { cfi, fraction } }),
      );
    }
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
      this.relocate('epubcfi(/6/2)', 0.2);
    }
    async goToFraction(fraction: number) {
      this.relocate('epubcfi(/6/4)', fraction);
    }
    resolveNavigation(target: string) {
      return target;
    }
    async next() {}
    async prev() {}
    close() {}
    clearSearch() {}
  }
  customElements.define('mock-navigation-view', MockView);
  return { View: MockView };
});
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  state.fail = false;
  state.opens = 0;
  state.pending = null;
  state.destroy.mockClear();
});
async function setup() {
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
  const root = createRoot(host),
    onPosition = vi.fn(),
    onClose = vi.fn();
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
          position: {
            cfi: 'epubcfi(/6/2)',
            fraction: 0.2,
            section: '',
            updatedAt: 0,
          },
        }}
        bytes={new Uint8Array([1])}
        preferences={defaults.reader}
        onPreferences={() => {}}
        onPosition={onPosition}
        onAnnotations={async () => {}}
        onClose={onClose}
      />,
    ),
  );
  return { root, onPosition, onClose };
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (button) =>
      button.textContent === text || button.getAttribute('aria-label') === text,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
it('offers recovery without opening immersive controls and retries loading', async () => {
  state.fail = true;
  const ctx = await setup();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Fixture load failed',
  );
  await click('Back to library');
  expect(ctx.onClose).toHaveBeenCalledOnce();
  state.fail = false;
  await click('Retry');
  expect(state.opens).toBe(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await act(async () => ctx.root.unmount());
});
it('can exit a pending load and disposes a publication that resolves after exit', async () => {
  let finish!: () => void;
  state.pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const ctx = await setup();
  expect(document.querySelector('.reader-loading')?.textContent).toContain(
    'Opening book',
  );
  await click('Back to library');
  expect(ctx.onClose).toHaveBeenCalledOnce();
  await act(async () => ctx.root.unmount());
  await act(async () => finish());
  expect(state.destroy).toHaveBeenCalledOnce();
  expect(ctx.onPosition).not.toHaveBeenCalled();
});
it('does not save previewed progress and can return or explicitly continue', async () => {
  const ctx = await setup();
  ctx.onPosition.mockClear();
  const preview = async () => {
    await click('Jump to page or percentage');
    const input = document.querySelector('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '100');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      document
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
  };
  await preview();
  expect(ctx.onPosition).not.toHaveBeenCalled();
  await click('Return to reading');
  expect(ctx.onPosition).not.toHaveBeenCalled();
  await preview();
  await click('Continue here');
  expect(ctx.onPosition).toHaveBeenLastCalledWith(
    expect.objectContaining({ fraction: 1 }),
  );
  await act(async () => ctx.root.unmount());
});
