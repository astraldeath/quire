import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hardenFoliate } from '../scripts/foliate-transform';
const source = readFileSync('node_modules/foliate-js/paginator.js', 'utf8');
const id = '/node_modules/foliate-js/paginator.js';
function fixture() {
  const output = hardenFoliate(source, id)!;
  const method = output.slice(output.indexOf('    async load('), output.indexOf('    render(layout) {'));
  const Frame = new Function('getDirection', 'getBackground', `return class {
    #iframe; #vertical; #rtl; #observer = { observe() {} }; #contentRange = { selectNodeContents() {} };
    constructor(iframe) { this.#iframe = iframe; }
    get document() { return this.#iframe.contentDocument; }
    render() {} expand() {}
    ${method}
  }`)(() => ({ vertical: false, rtl: false }), () => 'white');
  const iframe = Object.assign(new EventTarget(), { src: '', style: {} as Record<string, string>, contentDocument: null as any });
  const frame = new Frame(iframe);
  return { iframe, frame };
}
describe('foliate sandbox and bounded loading', () => {
  it('keeps trusted parent event listeners compatible with WebKit and rejects upstream drift', () => {
    expect(hardenFoliate(source, id)).toContain("'allow-same-origin allow-scripts'");
    expect(() => hardenFoliate(source.replace('afterLoad?.(doc)', 'changed(doc)'), id)).toThrow(/review/i);
  });
  it('rejects a stalled frame with its observed readiness after the deadline', async () => {
    vi.useFakeTimers(); const { frame } = fixture();
    const result = expect(frame.load('blob:test')).rejects.toThrow(/timed out.*unavailable/i);
    await vi.advanceTimersByTimeAsync(15000); await result; vi.useRealTimers();
  });
  it('reports callback exceptions rather than leaving load pending', async () => {
    const { frame, iframe } = fixture(); iframe.contentDocument = { URL: 'blob:test', readyState: 'complete' };
    const result = expect(frame.load('blob:test', () => { throw new Error('layout failed'); })).rejects.toThrow('layout failed');
    iframe.dispatchEvent(new Event('load')); await result;
  });
  it('loads a ready book without an iframe load event, only once', async () => {
    vi.useFakeTimers(); const { frame, iframe } = fixture(); const callback = vi.fn();
    const result = frame.load('blob:test', callback);
    iframe.contentDocument = { URL: 'blob:test', readyState: 'complete', body: { style: {} }, fonts: { ready: Promise.resolve() } };
    await vi.advanceTimersByTimeAsync(50); await result;
    iframe.dispatchEvent(new Event('load')); await vi.advanceTimersByTimeAsync(100);
    expect(callback).toHaveBeenCalledTimes(1); expect(iframe.style.display).toBe('block');
    expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
  });
});

it('unlocks page navigation after a renderer failure so the next turn can retry', async () => {
  const output = hardenFoliate(source, id)!;
  const method = output.slice(output.indexOf('    async #turnPage('), output.indexOf('    async prev(distance)'));
  const TestPaginator = new Function('wait', `return class {
    #locked = false;
    attempts = 0;
    hasAttribute() { return true; }
    #scrollPrev() { return this.#scrollNext(); }
    #scrollNext() { if (++this.attempts === 1) throw new Error('failed chapter'); return false; }
    #adjacentIndex() { return 0; }
    async #goTo() {}
    turn() { return this.#turnPage(1); }
    ${method}
  }`)(async () => {});
  const paginator = new TestPaginator();
  await expect(paginator.turn()).rejects.toThrow('failed chapter');
  await paginator.turn(); expect(paginator.attempts).toBe(2);
});
