import type { ReaderPreferences } from '../../domain/models';
import type { View } from 'foliate-js/view.js';

export function sideTurn(x: number, width: number, rtl = false) {
  if (width <= 0 || x < 0 || x > width) return null;
  const side = x < width * 0.25 ? 'prev' : x > width * 0.75 ? 'next' : null;
  return rtl && side ? (side === 'prev' ? 'next' : 'prev') : side;
}

export function boundaryTurn(
  delta: number,
  start: number,
  end: number,
  size: number,
) {
  if (delta > 0 && size - end <= 2) return 'next';
  if (delta < 0 && start <= 2) return 'prev';
  return null;
}

/** Install in both the sandboxed book document and its outer renderer margins. */
export function installReadingInteractions(
  target: Document | HTMLElement,
  view: View,
  preferences: () => ReaderPreferences,
  onError: (message: string) => void = () => {},
  onCenterTap: () => void = () => {},
) {
  const controller = new AbortController();
  const options = { signal: controller.signal, capture: true };
  const doc =
    target.nodeType === 9 ? (target as Document) : target.ownerDocument!;
  let down = { x: 0, y: 0, time: 0 };
  let touchY = 0;
  let dragX = 0;
  let dragOrigin = 0;
  let dragging = false;
  let velocity = 0;
  let dragTime = 0;
  let touchStart: { x: number; y: number; time: number } | null = null;
  let lastTouch = 0;
  let touchOnLink = false;
  let suppressClickUntil = 0;
  let moved = false;
  let busy = false;
  let lastTurn = 0;
  const cancelDrag = () => {
    if (dragging) {
      view.renderer.containerPosition = dragOrigin;
      view.renderer.snap?.(0, 0);
      dragging = false;
    }
  };
  const interactive = (event: Event, includeLinks = true) =>
    event
      .composedPath()
      .some(
        (node) =>
          'nodeType' in node &&
          node.nodeType === 1 &&
          (node as Element).matches(
            `${includeLinks ? 'a,' : ''}button,input,select,textarea,[contenteditable],audio,video`,
          ),
      );
  const selected = () => Boolean(doc.getSelection()?.toString());
  const turn = (direction: 'prev' | 'next') => {
    if (busy || Date.now() - lastTurn < 350) return;
    busy = true;
    lastTurn = Date.now();
    void view[direction]()
      .catch((error) => onError(`Could not turn page: ${String(error)}`))
      .finally(() => {
        busy = false;
      });
  };
  const continueScroll = (delta: number) => {
    if (view.isFixedLayout || preferences().flow !== 'continuous' || selected())
      return;
    const r = view.renderer;
    const direction = boundaryTurn(delta, r.start, r.end, r.viewSize);
    if (direction && !(direction === 'prev' ? r.atStart : r.atEnd))
      turn(direction);
  };
  target.addEventListener(
    'pointerdown',
    (event) => {
      const e = event as PointerEvent;
      down = { x: e.clientX, y: e.clientY, time: Date.now() };
      moved = false;
    },
    options,
  );
  target.addEventListener(
    'pointermove',
    (event) => {
      const e = event as PointerEvent;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) moved = true;
    },
    options,
  );
  target.addEventListener(
    'click',
    (event) => {
      const e = event as MouseEvent;
      if (Date.now() < suppressClickUntil && e.detail !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (
        Date.now() - lastTouch < 700 ||
        e.button !== 0 ||
        e.detail !== 1 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        moved ||
        Date.now() - down.time > 450 ||
        interactive(e) ||
        selected()
      )
        return;
      tap(e.clientX);
    },
    options,
  );
  target.addEventListener(
    'wheel',
    (event) => {
      if (!interactive(event, false))
        continueScroll((event as WheelEvent).deltaY);
    },
    { ...options, passive: true },
  );
  const isPaginated = () =>
    view.renderer.localName === 'foliate-fxl' ||
    preferences().flow === 'paginated';
  const rtl = () =>
    view.isFixedLayout
      ? Boolean(view.renderer.rtl)
      : doc.defaultView?.getComputedStyle(doc.documentElement).direction ===
        'rtl';
  const tap = (clientX: number) => {
    const frame = doc.defaultView?.frameElement;
    const rect = view.getBoundingClientRect();
    const direction = sideTurn(
      clientX *
        (frame
          ? frame.getBoundingClientRect().width /
            (doc.defaultView?.innerWidth || frame.clientWidth || 1)
          : 1) +
        (frame?.getBoundingClientRect().left ?? 0) -
        rect.left,
      rect.width,
      rtl(),
    );
    if (!direction && rect.width > 0) onCenterTap();
    else if (direction && isPaginated() && preferences().tapToTurn !== false)
      turn(direction);
  };
  target.addEventListener(
    'touchstart',
    (event) => {
      const e = event as TouchEvent;
      const touch = e.touches[0];
      lastTouch = Date.now();
      suppressClickUntil = 0;
      touchOnLink = interactive(e);
      touchStart =
        e.touches.length === 1 && !interactive(e, false) && !selected()
          ? {
              x: touch.screenX ?? touch.clientX,
              y: touch.screenY ?? touch.clientY,
              time: Date.now(),
            }
          : null;
      touchY = touch?.screenY ?? touch?.clientY ?? 0;
      dragX = touch?.screenX ?? touch?.clientX ?? 0;
      dragTime = Date.now();
      velocity = 0;
      dragging = false;
      dragOrigin = view.renderer.containerPosition;
      // Own paginated gestures: do not also invoke foliate's snap handlers.
      if (isPaginated()) e.stopImmediatePropagation();
    },
    { ...options, passive: true },
  );
  target.addEventListener(
    'touchmove',
    (event) => {
      const e = event as TouchEvent;
      if (isPaginated()) e.stopImmediatePropagation();
      if (e.touches.length !== 1) {
        touchStart = null;
        cancelDrag();
        return;
      }
      if (
        !touchStart ||
        selected() ||
        (doc.defaultView?.visualViewport?.scale ?? 1) > 1
      )
        return;
      const touch = e.touches[0];
      if (isPaginated()) {
        const x = touch.screenX ?? touch.clientX;
        const dx = dragX - x;
        if (
          preferences().swipeToTurn !== false &&
          (dragging ||
            Math.abs((touch.screenX ?? touch.clientX) - touchStart.x) > 12) &&
          Math.abs((touch.screenX ?? touch.clientX) - touchStart.x) >
            Math.abs((touch.screenY ?? touch.clientY) - touchStart.y)
        ) {
          if (e.cancelable) e.preventDefault();
          dragging = true;
          suppressClickUntil = Date.now() + 700;
          velocity = dx / Math.max(16, Date.now() - dragTime);
          if (typeof view.renderer.snap === 'function')
            view.renderer.scrollBy(dx, 0);
        }
        dragX = x;
        dragTime = Date.now();
      } else {
        const delta = touchY - (touch.screenY ?? touch.clientY);
        // Let the native overflow scroller own motion and momentum.
        // Observe only boundary gestures; cancelling here disables iOS inertia.
        if (Math.abs((touch.screenY ?? touch.clientY) - touchStart.y) > 10) {
          suppressClickUntil = Date.now() + 700;
          continueScroll(delta);
        }
      }
      touchY = touch.screenY ?? touch.clientY;
    },
    { ...options, passive: false },
  );
  target.addEventListener(
    'touchend',
    (event) => {
      const e = event as TouchEvent;
      if (isPaginated()) e.stopImmediatePropagation();
      const start = touchStart;
      touchStart = null;
      lastTouch = Date.now();
      const touch = e.changedTouches[0];
      if (
        !start ||
        !touch ||
        selected() ||
        (doc.defaultView?.visualViewport?.scale ?? 1) > 1
      ) {
        cancelDrag();
        return;
      }
      const dx = (touch.screenX ?? touch.clientX) - start.x,
        dy = (touch.screenY ?? touch.clientY) - start.y;
      if (dragging) {
        dragging = false;
        suppressClickUntil = Date.now() + 700;
        if (e.cancelable) e.preventDefault();
        // Slow drags settle to the nearest page; a quick release supplies momentum.
        if (typeof view.renderer.snap !== 'function') {
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy))
            turn(dx < 0 !== rtl() ? 'next' : 'prev');
        } else
          view.renderer.snap(
            Date.now() - dragTime < 100
              ? Math.max(-0.6, Math.min(0.6, velocity))
              : 0,
            0,
          );
      } else if (
        !touchOnLink &&
        Math.hypot(dx, dy) < 10 &&
        Date.now() - start.time < 450
      ) {
        if (e.cancelable) e.preventDefault();
        tap(touch.clientX);
      }
    },
    { ...options, passive: false },
  );
  target.addEventListener(
    'touchcancel',
    () => {
      touchStart = null;
      cancelDrag();
    },
    options,
  );
  return () => controller.abort();
}
