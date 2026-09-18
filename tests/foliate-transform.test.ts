import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hardenFoliate } from '../scripts/foliate-transform';
const source = readFileSync('node_modules/foliate-js/paginator.js', 'utf8');
const id = '/node_modules/foliate-js/paginator.js';
const fixedSource = readFileSync(
  'node_modules/foliate-js/fixed-layout.js',
  'utf8',
);
const fixedId = '/node_modules/foliate-js/fixed-layout.js';

it.each([false, true])(
  'uses bounded srcdoc loading for comics (hosted=%s) and rejects fixed-layout upstream drift',
  async (hosted) => {
    const output = hardenFoliate(fixedSource, fixedId + '?v=cache', hosted)!;
    expect(output).toContain('iframe.srcdoc = markup');
    expect(output).not.toContain('iframe.src = src');
    expect(() =>
      hardenFoliate(
        fixedSource.replace(
          "iframe.setAttribute('scrolling', 'no')",
          'changed()',
        ),
        fixedId,
      ),
    ).toThrow(/review/i);
    const method = output.slice(
      output.indexOf('    async #createFrame('),
      output.indexOf('    #render(side'),
    );
    const Frame = new Function(
      'getViewport',
      `return class extends EventTarget {
    #root = { append() {} };
    create() { return this.#createFrame({ index: 0, src: 'blob:comic' }); }
    ${method}
  }`,
    )(() => ({ width: 600, height: 900 }));
    let iframe: HTMLIFrameElement;
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag);
      if (tag === 'iframe') iframe = element as HTMLIFrameElement;
      return element;
    }) as typeof document.createElement);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => '<html><body>Page</body></html>',
      })),
    );
    vi.useFakeTimers();
    try {
      const frame = new Frame();
      const loaded = vi.fn();
      frame.addEventListener('load', loaded);
      const pending = frame.create();
      Object.defineProperty(iframe!, 'contentDocument', {
        configurable: true,
        value: { URL: 'about:blank', readyState: 'complete' },
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(loaded).not.toHaveBeenCalled();
      Object.defineProperty(iframe!, 'contentDocument', {
        configurable: true,
        value: { URL: 'about:srcdoc', readyState: 'complete' },
      });
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toMatchObject({ width: 600, height: 900 });
      expect(loaded).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      const stalled = expect(frame.create()).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(15000);
      await stalled;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  },
);
function fixture(hosted = false) {
  const output = hardenFoliate(source, id, hosted)!;
  const method = output.slice(
    output.indexOf('    async load('),
    output.indexOf('    render(layout) {'),
  );
  const Frame = new Function(
    'getDirection',
    'getBackground',
    `return class {
    #iframe; #vertical; #rtl; #observer = { observe() {} }; #contentRange = { selectNodeContents() {} };
    constructor(iframe) { this.#iframe = iframe; }
    get document() { return this.#iframe.contentDocument; }
    render() {} expand() {}
    ${method}
  }`,
  )(
    () => ({ vertical: false, rtl: false }),
    () => 'white',
  );
  const iframe = Object.assign(new EventTarget(), {
    src: '',
    style: {} as Record<string, string>,
    contentDocument: null as any,
  });
  const frame = new Frame(iframe);
  return { iframe, frame };
}
describe('foliate sandbox and bounded loading', () => {
  it('applies frame readiness handling to Vite cache-tagged module URLs', () => {
    expect(hardenFoliate(source, id + '?v=cache')).toContain(
      'Book frame load timed out',
    );
  });
  it('keeps trusted parent event listeners compatible with WebKit and rejects upstream drift', () => {
    expect(hardenFoliate(source, id)).toContain(
      "'allow-same-origin allow-scripts'",
    );
    expect(() =>
      hardenFoliate(source.replace('afterLoad?.(doc)', 'changed(doc)'), id),
    ).toThrow(/review/i);
  });
  it('rejects a stalled frame with its observed readiness after the deadline', async () => {
    vi.useFakeTimers();
    const { frame } = fixture();
    const result = expect(frame.load('blob:test')).rejects.toThrow(
      /timed out.*unavailable/i,
    );
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    vi.useRealTimers();
  });
  it('reports callback exceptions rather than leaving load pending', async () => {
    const { frame, iframe } = fixture();
    iframe.contentDocument = { URL: 'blob:test', readyState: 'complete' };
    const result = expect(
      frame.load('blob:test', () => {
        throw new Error('layout failed');
      }),
    ).rejects.toThrow('layout failed');
    iframe.dispatchEvent(new Event('load'));
    await result;
  });
  it('loads a ready book without an iframe load event, only once', async () => {
    vi.useFakeTimers();
    const { frame, iframe } = fixture();
    const callback = vi.fn();
    const result = frame.load('blob:test', callback);
    iframe.contentDocument = {
      URL: 'blob:test',
      readyState: 'complete',
      body: { style: {} },
      fonts: { ready: Promise.resolve() },
    };
    await vi.advanceTimersByTimeAsync(50);
    await result;
    iframe.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(iframe.style.display).toBe('block');
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

it('unlocks page navigation after a renderer failure so the next turn can retry', async () => {
  const output = hardenFoliate(source, id)!;
  const method = output.slice(
    output.indexOf('    async #turnPage('),
    output.indexOf('    async prev(distance)'),
  );
  const TestPaginator = new Function(
    'wait',
    `return class {
    #locked = false;
    attempts = 0;
    hasAttribute() { return true; }
    #scrollPrev() { return this.#scrollNext(); }
    #scrollNext() { if (++this.attempts === 1) throw new Error('failed chapter'); return false; }
    #adjacentIndex() { return 0; }
    async #goTo() {}
    turn() { return this.#turnPage(1); }
    ${method}
  }`,
  )(async () => {});
  const paginator = new TestPaginator();
  await expect(paginator.turn()).rejects.toThrow('failed chapter');
  await paginator.turn();
  expect(paginator.attempts).toBe(2);
});

it('completes a hosted chapter when srcdoc is ready without accepting the initial blank document', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () => '<html><body>Chapter</body></html>',
    })),
  );
  try {
    const { frame, iframe } = fixture(true);
    const callback = vi.fn();
    const loaded = frame.load('blob:test', callback);
    iframe.contentDocument = { URL: 'about:blank', readyState: 'complete' };
    await vi.advanceTimersByTimeAsync(100);
    expect(callback).not.toHaveBeenCalled();
    iframe.contentDocument = {
      URL: 'about:srcdoc',
      readyState: 'complete',
      body: { style: {} },
      fonts: { ready: Promise.resolve() },
    };
    await vi.advanceTimersByTimeAsync(50);
    await loaded;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
