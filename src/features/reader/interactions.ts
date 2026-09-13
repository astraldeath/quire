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
export function installReadingInteractions(target: Document | HTMLElement, view: View, preferences: () => ReaderPreferences, onError: (message: string) => void = () => {}) {
  const controller = new AbortController();
  const options = { signal: controller.signal, capture: true };
  const doc = target.nodeType === 9 ? target as Document : target.ownerDocument!;
  let down = { x: 0, y: 0, time: 0 };
  let touchY = 0;
  let touchStart: { x: number; y: number; time: number } | null = null;
  let lastTouch = 0;
  let moved = false;
  let busy = false;
  let lastTurn = 0;
  const interactive = (event: Event) => event.composedPath().some(node =>
    'nodeType' in node && node.nodeType === 1 && (node as Element).matches('a,button,input,select,textarea,[contenteditable],audio,video'));
  const selected = () => Boolean(doc.getSelection()?.toString());
  const turn = (direction: 'prev' | 'next') => {
    if (busy || Date.now() - lastTurn < 350) return;
    busy = true; lastTurn = Date.now();
    void view[direction]().catch(error => onError(`Could not turn page: ${String(error)}`)).finally(() => { busy = false; });
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
      Date.now() - lastTouch < 700 || e.button !== 0 || e.detail !== 1 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
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
  const isPaginated = () => preferences().flow === 'paginated';
  const rtl = () => doc.defaultView?.getComputedStyle(doc.documentElement).direction === 'rtl';
  const tap = (clientX: number) => {
    const frame = doc.defaultView?.frameElement;
    const rect = view.getBoundingClientRect();
    const direction = sideTurn(clientX + (frame?.getBoundingClientRect().left ?? 0) - rect.left, rect.width, rtl());
    if (direction) turn(direction);
  };
  target.addEventListener('touchstart', event => {
    const e = event as TouchEvent;
    const touch = e.touches[0];
    lastTouch = Date.now();
    touchStart = e.touches.length === 1 && !interactive(e) && !selected() ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
    touchY = touch?.clientY ?? 0;
    // Own paginated gestures: do not also invoke foliate's snap handlers.
    if (isPaginated()) e.stopImmediatePropagation();
  }, { ...options, passive: true });
  target.addEventListener('touchmove', event => {
    const e = event as TouchEvent;
    if (isPaginated()) e.stopImmediatePropagation();
    if (e.touches.length !== 1) { touchStart = null; return; }
    if (!touchStart || selected() || (doc.defaultView?.visualViewport?.scale ?? 1) > 1) return;
    const touch = e.touches[0];
    if (isPaginated()) {
      if (preferences().swipeToTurn !== false && Math.abs(touch.clientX - touchStart.x) > 12 && e.cancelable) e.preventDefault();
    } else {
      const delta = touchY - touch.clientY;
      // WKWebView does not consistently chain iframe scrolling to the parent.
      // Scroll the paginator itself, while preserving link/selection/pinch handling.
      if (Math.abs(touch.clientY - touchStart.y) > 10) {
        if (e.cancelable) e.preventDefault();
        continueScroll(delta);
        const r = view.renderer;
        r.containerPosition = Math.max(0, Math.min(Math.max(0, r.viewSize - (r.end-r.start)), r.containerPosition + delta));
      }
    }
    touchY = touch.clientY;
  }, { ...options, passive: false });
  target.addEventListener('touchend', event => {
    const e = event as TouchEvent;
    if (isPaginated()) e.stopImmediatePropagation();
    const start = touchStart; touchStart = null; lastTouch = Date.now();
    const touch = e.changedTouches[0];
    if (!start || !touch || !isPaginated() || selected() || (doc.defaultView?.visualViewport?.scale ?? 1) > 1) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (preferences().swipeToTurn !== false && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)*1.4) {
      if (e.cancelable) e.preventDefault();
      turn((dx < 0) !== rtl() ? 'next' : 'prev');
    } else if (preferences().tapToTurn !== false && Math.hypot(dx,dy) < 10 && Date.now()-start.time < 450) {
      if (e.cancelable) e.preventDefault();
      tap(touch.clientX);
    }
  }, { ...options, passive: false });
  target.addEventListener('touchcancel', () => { touchStart = null; }, options);
  return () => controller.abort();
}
