import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hardenFoliate } from '../scripts/foliate-transform';
import { bufferSections } from '../src/features/reader/section-buffer';
const source = readFileSync('node_modules/foliate-js/paginator.js', 'utf8');
const id = '/node_modules/foliate-js/paginator.js';
const fixedSource = readFileSync(
  'node_modules/foliate-js/fixed-layout.js',
  'utf8',
);
const fixedId = '/node_modules/foliate-js/fixed-layout.js';

function fixedRenderer(rtl = false, count = 4) {
  const transformed = hardenFoliate(fixedSource, fixedId)!;
  const start = transformed.indexOf('    async #createFrame(');
  const end = transformed.indexOf('    #render(side', start);
  const source = (
    transformed.slice(0, start) +
    `
    async #createFrame({ index, src }) {
      if (src === 'fail') throw new Error('failed page')
      const element = document.createElement('div')
      const iframe = document.createElement('iframe')
      element.append(iframe)
      return { element, iframe, blank: !src, width: 600, height: 900 }
    }
  ` +
    transformed.slice(end)
  )
    .replace(/^import .*$/m, '')
    .replace('export class', 'class');
  const name = 'test-fxl-' + Math.random().toString(36).slice(2);
  const Renderer = new Function(
    'ResizeObserver',
    'CSSStyleSheet',
    source.replace(
      "customElements.define('foliate-fxl', FixedLayout)",
      `customElements.define('${name}', FixedLayout); return FixedLayout`,
    ),
  )(
    class {
      constructor(readonly callback: () => void) {}
      observe(target: { resize: () => void }) {
        target.resize = this.callback;
      }
      unobserve() {}
    },
    class {
      replaceSync() {}
    },
  );
  const renderer = new Renderer();
  vi.spyOn(renderer, 'getBoundingClientRect').mockReturnValue({
    width: 400,
    height: 800,
  });
  const sections = Array.from({ length: count }, (_, i) => ({
    load: async () => 'page' + i,
    unload: vi.fn(),
  }));
  renderer.open({
    dir: rtl ? 'rtl' : 'ltr',
    rendition: { layout: 'pre-paginated' },
    sections,
  });
  return { renderer, sections };
}

it('releases old fixed spreads through the section buffer and releases the visible spread on close', async () => {
  const { renderer, sections } = fixedRenderer(false, 8);
  const unloads = sections.map((section) => section.unload);
  const buffer = bufferSections(sections);
  renderer.addEventListener('relocate', (event: CustomEvent) =>
    buffer.relocate(event.detail.index),
  );
  await renderer.goTo({ index: 1 });
  await renderer.goTo({ index: 5 });
  for (let i = 0; i < 40; i++) await Promise.resolve();
  expect(unloads[1]).toHaveBeenCalledOnce();
  expect(unloads[2]).toHaveBeenCalledOnce();
  expect(unloads[5]).not.toHaveBeenCalled();
  expect(unloads[6]).not.toHaveBeenCalled();
  renderer.destroy();
  await buffer.dispose();
  expect(unloads[5]).toHaveBeenCalledOnce();
  expect(unloads[6]).toHaveBeenCalledOnce();
});

it('releases both spread pages after partial frame failure', async () => {
  const { renderer, sections } = fixedRenderer();
  await renderer.goTo({ index: 0 });
  sections[2].load = async () => 'fail';
  await expect(renderer.goTo({ index: 1 })).rejects.toThrow('failed page');
  expect(sections[0].unload).toHaveBeenCalledOnce();
  expect(sections[1].unload).toHaveBeenCalledOnce();
  expect(sections[2].unload).toHaveBeenCalledOnce();
  expect(renderer.index).toBe(-1);
  sections[2].load = async () => 'page2';
  await renderer.goTo({ index: 1 });
  expect(renderer.index).toBe(1);
  renderer.destroy();
});

it('does not retain a spread that finishes loading after close', async () => {
  const { renderer, sections } = fixedRenderer();
  let resolve!: (value: string) => void;
  sections[0].load = () =>
    new Promise<string>((done) => {
      resolve = done;
    });
  const pending = renderer.goTo({ index: 0 });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  renderer.destroy();
  resolve('page0');
  await expect(pending).rejects.toThrow('Reader is closed');
  expect(sections[0].unload).toHaveBeenCalledOnce();
  expect(renderer.index).toBe(-1);
});

it('completes when the final two-page spread is visible in landscape', async () => {
  const { renderer } = fixedRenderer(false, 3);
  renderer.getBoundingClientRect.mockReturnValue({ width: 1200, height: 800 });
  await renderer.goTo({ index: 1 });
  expect(renderer.index).toBe(1);
  expect(renderer.atEnd).toBe(true);
  renderer.destroy();
});

it('reports a fresh position when resizing changes which fixed pages are visible', async () => {
  const { renderer } = fixedRenderer(false, 3);
  renderer.getBoundingClientRect.mockReturnValue({ width: 1200, height: 800 });
  await renderer.goTo({ index: 1 });
  expect(renderer.atEnd).toBe(true);
  const positions: { index: number; reason: string; atEnd: boolean }[] = [];
  renderer.addEventListener('relocate', (event: CustomEvent) =>
    positions.push({ ...event.detail, atEnd: renderer.atEnd }),
  );
  renderer.getBoundingClientRect.mockReturnValue({ width: 400, height: 800 });
  renderer.resize();
  expect(positions).toEqual([
    expect.objectContaining({ index: 1, reason: 'resize', atEnd: false }),
  ]);
  renderer.resize();
  expect(positions).toHaveLength(1);
  renderer.getBoundingClientRect.mockReturnValue({ width: 1200, height: 800 });
  renderer.resize();
  expect(positions[1]).toMatchObject({
    index: 1,
    reason: 'resize',
    atEnd: true,
  });
  renderer.destroy();
});

it.each([false, true])(
  'reports start and completion for fixed page navigation (rtl=%s)',
  async (rtl) => {
    const { renderer } = fixedRenderer(rtl);
    await renderer.goTo({ index: 0 });
    expect(renderer.atStart).toBe(true);
    expect(renderer.atEnd).toBe(false);
    await renderer.goTo({ index: 3 });
    expect(renderer.atStart).toBe(false);
    expect(renderer.atEnd).toBe(true);
    renderer.destroy();
  },
);

it.each([false, true])(
  'restores either page in the same spread (rtl=%s)',
  async (rtl) => {
    const { renderer } = fixedRenderer(rtl);
    const located = vi.fn();
    renderer.addEventListener('relocate', (event: CustomEvent) =>
      located(event.detail.index),
    );
    await renderer.goTo({ index: 1 });
    expect(renderer.index).toBe(1);
    await renderer.goTo({ index: 2 });
    expect(renderer.index).toBe(2);
    expect(located.mock.calls.map((call) => call[0])).toEqual([1, 2]);
    await renderer.prev();
    expect(renderer.index).toBe(1);
    await renderer.next();
    expect(renderer.index).toBe(2);
    renderer.destroy();
  },
);

it('retries a failed spread without treating it as already loaded', async () => {
  const { renderer, sections } = fixedRenderer();
  sections[0].load = async () => 'fail';
  await expect(renderer.goTo({ index: 0 })).rejects.toThrow('failed page');
  sections[0].load = async () => 'page';
  await renderer.goTo({ index: 0 });
  expect(renderer.index).toBe(0);
  renderer.destroy();
});

it('uses package viewport strings as width and height values', () => {
  const transformed = hardenFoliate(fixedSource, fixedId)!;
  const helpers = transformed.slice(
    transformed.indexOf('const parseViewport'),
    transformed.indexOf('export class'),
  );
  const viewport = new Function(helpers + '; return getViewport')();
  expect(
    viewport(
      document.implementation.createHTMLDocument(),
      'width=600,height=900',
    ),
  ).toEqual({ width: '600', height: '900' });
});

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
