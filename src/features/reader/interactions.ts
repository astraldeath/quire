import type { ReaderPreferences } from '../../domain/models';
import type { View } from 'foliate-js/view.js';

export function sideTurn(x: number, width: number, rtl = false) {
  if (width <= 0 || x < 0 || x > width) return null;
  const side = x < width * .25 ? 'prev' : x > width * .75 ? 'next' : null;
  return rtl && side ? (side === 'prev' ? 'next' : 'prev') : side;
}

export function boundaryTurn(delta: number, start: number, end: number, size: number) {
  if (delta > 0 && size - end <= 2) return 'next';
  if (delta < 0 && start <= 2) return 'prev';
  return null;
}

/** Install in both the sandboxed book document and its outer renderer margins. */
export function installReadingInteractions(target: Document | HTMLElement, view: View, preferences: () => ReaderPreferences) {
  const controller = new AbortController();
  const options = { signal: controller.signal, capture: true };
  const doc = target.nodeType === 9 ? target as Document : target.ownerDocument!;
  let down = { x: 0, y: 0, time: 0 };
  let touchY = 0;
  let moved = false;
  let busy = false;
  let lastTurn = 0;
  const interactive = (event: Event) => event.composedPath().some(node =>
    'nodeType' in node && node.nodeType === 1 && (node as Element).matches('a,button,input,select,textarea,[contenteditable],audio,video'));
  const selected = () => Boolean(doc.getSelection()?.toString());
  const turn = (direction: 'prev' | 'next') => {
    if (busy || Date.now() - lastTurn < 350) return;
    busy = true; lastTurn = Date.now();
    void view[direction]().catch(() => {}).finally(() => { busy = false; });
  };
  const continueScroll = (delta: number) => {
    if (preferences().flow !== 'continuous' || selected()) return;
    const r = view.renderer;
    const direction = boundaryTurn(delta, r.start, r.end, r.viewSize);
    if (direction && !(direction === 'prev' ? r.atStart : r.atEnd)) turn(direction);
  };
  target.addEventListener('pointerdown', event => {
    const e = event as PointerEvent;
    down = { x: e.clientX, y: e.clientY, time: Date.now() }; moved = false;
  }, options);
  target.addEventListener('pointermove', event => {
    const e = event as PointerEvent;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) moved = true;
  }, options);
  target.addEventListener('click', event => {
    const e = event as MouseEvent;
    if (preferences().tapToTurn === false || preferences().flow !== 'paginated' ||
      e.button !== 0 || e.detail !== 1 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
      moved || Date.now() - down.time > 450 || interactive(e) || selected()) return;
    const frame = doc.defaultView?.frameElement;
    const rect = view.getBoundingClientRect();
    const x = e.clientX + (frame?.getBoundingClientRect().left ?? 0) - rect.left;
    const rtl = doc.defaultView?.getComputedStyle(doc.documentElement).direction === 'rtl';
    const direction = sideTurn(x, rect.width, rtl);
    if (direction) { e.preventDefault(); turn(direction); }
  }, options);
  target.addEventListener('wheel', event => {
    if (!interactive(event)) continueScroll((event as WheelEvent).deltaY);
  }, { ...options, passive: true });
  target.addEventListener('touchstart', event => {
    const e = event as TouchEvent;
    touchY = e.touches[0]?.clientY ?? 0;
    if (preferences().flow === 'paginated' && preferences().swipeToTurn === false) e.stopImmediatePropagation();
  }, { ...options, passive: true });
  target.addEventListener('touchmove', event => {
    const e = event as TouchEvent;
    if (preferences().flow === 'paginated' && preferences().swipeToTurn === false) e.stopImmediatePropagation();
    if (e.touches.length !== 1 || interactive(e)) return;
    const y = e.touches[0].clientY;
    if (Math.abs(touchY - y) > 24) { continueScroll(touchY - y); touchY = y; }
  }, { ...options, passive: true });
  target.addEventListener('touchend', event => {
    if (preferences().flow === 'paginated' && preferences().swipeToTurn === false) event.stopImmediatePropagation();
  }, options);
  return () => controller.abort();
}
