import {
  useEffect,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type CSSProperties,
} from 'react';
import './comic-swipe.css';
import type { ReaderBook } from '../../books';
import type { Position, ReaderPreferences } from '../../domain/models';
import {
  comicCFI,
  comicPageAt,
  comicSpread,
  turnComicPage,
} from './comic-navigation';
import { tapAction } from './control-mapping';

export interface ComicNavigation {
  navigate(target: string): boolean;
}
type Page = NonNullable<ReaderBook['comicPages']>[number];

function ComicImage({
  page,
  index,
  continuous,
  root,
  dimensions,
  beforeResize,
  onLoad,
  active,
  hidden,
  spreadSide,
  onNear,
  onSettled,
  onReady,
  placement,
  objectPosition,
}: {
  page: Page;
  index: number;
  continuous: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  dimensions: Map<number, number>;
  beforeResize(): () => void;
  onLoad(): void;
  active: boolean;
  hidden: boolean;
  spreadSide?: 'first' | 'last';
  onNear(index: number, near: boolean): void;
  onSettled(index: number): void;
  onReady(index: number): void;
  placement?: CSSProperties;
  objectPosition?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(dimensions.get(index) ?? 0.7);
  const restore = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    restore.current?.();
    restore.current = null;
  }, [ratio]);
  useEffect(() => {
    if (!continuous) return;
    const observer = new IntersectionObserver(
      ([entry]) => onNear(index, entry.isIntersecting),
      {
        root: root.current,
        rootMargin: '120% 0px',
      },
    );
    observer.observe(element.current!);
    return () => observer.disconnect();
  }, [continuous, root, index, onNear]);
  useEffect(() => {
    if (!active) {
      setSrc('');
      return;
    }
    const controller = new AbortController();
    let url: string | undefined;
    setSrc('');
    setFailed(false);
    void Promise.resolve()
      .then(() => page.blob(controller.signal))
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
        onSettled(index);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          onSettled(index);
          onReady(index);
        }
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [active, page, attempt, index, onSettled, onReady]);
  return (
    <div
      ref={element}
      className="comic-image"
      data-page={index}
      data-spread-side={spreadSide}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={
        placement ??
        (hidden
          ? { display: 'none' }
          : continuous
            ? { aspectRatio: ratio }
            : undefined)
      }
    >
      {src && !failed && (
        <img
          src={src}
          alt={`Page ${index + 1}`}
          draggable={false}
          style={{ objectPosition }}
          onLoad={(event) => {
            const image = event.currentTarget;
            const nextRatio = image.naturalWidth / image.naturalHeight;
            if (Number.isFinite(nextRatio) && nextRatio > 0) {
              if (continuous && nextRatio !== ratio)
                restore.current = beforeResize();
              dimensions.set(index, nextRatio);
              setRatio(nextRatio);
            }
            // Decode while the neighboring image is still hidden, then retain
            // that same element when it becomes the visible page.
            void (image.decode?.() ?? Promise.resolve())
              .then(() => {
                if (!image.isConnected) return;
                onLoad();
                onReady(index);
              })
              .catch(() => {
                if (!image.isConnected) return;
                setFailed(true);
                onReady(index);
              });
          }}
          onError={() => {
            setFailed(true);
            onReady(index);
          }}
        />
      )}
      {failed && (
        <p role="alert">
          Page {index + 1} could not load.{' '}
          <button
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

export function ComicPages({
  pages,
  position,
  preferences,
  navigationRef,
  onPosition,
  onCenterTap,
  onNavigate,
}: {
  pages: Page[];
  position?: Position;
  preferences: ReaderPreferences;
  navigationRef: Ref<ComicNavigation>;
  onPosition(position: Position): void;
  onCenterTap(): void;
  onNavigate(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dimensions = useRef(new Map<number, number>());
  const [page, setPage] = useState(() => comicPageAt(position, pages.length));
  const pageRef = useRef(page);
  const mode = preferences.comicMode ?? 'single';
  const rtl = preferences.comicDirection === 'rtl';
  const continuous = mode === 'webtoon';
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const changed = () => setReducedMotion(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  const animated = preferences.animated !== false && !reducedMotion;
  const [motion, setMotion] = useState({ offset: 0, settling: false });
  const settling = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const resetMotion = () => {
    clearTimeout(settleTimer.current);
    settling.current = false;
    setMotion({ offset: 0, settling: false });
  };
  useEffect(() => {
    down.current = null;
    resetMotion();
  }, [mode, rtl, animated, preferences.swipeToTurn]);
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  const [near, setNear] = useState(new Set<number>());
  const [settled, setSettled] = useState(new Set<number>());
  const [ready, setReady] = useState(new Set<number>());
  const [displayed, setDisplayed] = useState(page);
  const onNear = useCallback((index: number, value: boolean) => {
    setNear((previous) => {
      if (previous.has(index) === value) return previous;
      const next = new Set(previous);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);
  const onSettled = useCallback((index: number) => {
    setSettled((previous) =>
      previous.has(index) ? previous : new Set(previous).add(index),
    );
  }, []);
  const onReady = useCallback((index: number) => {
    setReady((previous) =>
      previous.has(index) ? previous : new Set(previous).add(index),
    );
  }, []);
  const targetSpread = comicSpread(page, pages.length, mode);
  const displayedSpread = comicSpread(displayed, pages.length, mode);
  const visiblePage =
    targetSpread.every((index) => ready.has(index)) ||
    !displayedSpread.every((index) => ready.has(index))
      ? page
      : displayed;
  const visibleSpread = comicSpread(visiblePage, pages.length, mode);
  useLayoutEffect(() => {
    setDisplayed(visiblePage);
  }, [visiblePage]);
  const retained = new Set<number>([...targetSpread, ...visibleSpread]);
  if (targetSpread.every((index) => settled.has(index))) {
    for (const direction of ['next', 'prev'] as const) {
      const neighbor = turnComicPage(page, pages.length, mode, direction);
      for (const index of comicSpread(neighbor, pages.length, mode))
        retained.add(index);
    }
  }
  if (continuous) {
    // A bounded viewport window, with one image on either side. Placeholder
    // slots remain in the document so distant images never alter scroll geometry.
    for (const index of [...near].sort(
      (a, b) => Math.abs(a - page) - Math.abs(b - page),
    )) {
      for (const neighbor of [index, index - 1, index + 1]) {
        if (retained.size < 12 && neighbor >= 0 && neighbor < pages.length)
          retained.add(neighbor);
      }
      if (retained.size >= 12) break;
    }
  }
  const retainedKey = [...retained].sort((a, b) => a - b).join(',');
  useEffect(() => {
    const keep = new Set(retainedKey.split(',').map(Number));
    const prune = (previous: Set<number>) =>
      [...previous].some((index) => !keep.has(index))
        ? new Set([...previous].filter((index) => keep.has(index)))
        : previous;
    setSettled(prune);
    setReady(prune);
    for (const index of decoded.current)
      if (!keep.has(index)) decoded.current.delete(index);
  }, [retainedKey]);
  const [atEnd, setAtEnd] = useState(false);
  const decoded = useRef(new Set<number>());
  const completionFrame = useRef(0);
  const reachedEnd = () => {
    const container = root.current;
    return Boolean(
      container &&
      decoded.current.has(pages.length - 1) &&
      container.clientHeight > 0 &&
      container.scrollHeight - container.scrollTop - container.clientHeight <=
        2,
    );
  };
  const updateEnd = () => setAtEnd(reachedEnd());
  useEffect(() => () => cancelAnimationFrame(completionFrame.current), []);
  const restoring = useRef(false);
  const frame = useRef(0);
  const down = useRef<{
    x: number;
    y: number;
    time: number;
    id: number;
    dragging: boolean;
  } | null>(null);
  const select = (index: number) => {
    pageRef.current = index;
    setPage(index);
  };
  const scrollToPage = (index: number) => {
    const slot = root.current?.querySelector<HTMLElement>(
      `[data-page="${index}"]`,
    );
    if (slot && root.current) root.current.scrollTop = slot.offsetTop;
    updateEnd();
  };
  const beforeResize = () => {
    const container = root.current;
    const anchor = container?.querySelector<HTMLElement>(
      `[data-page="${pageRef.current}"]`,
    );
    if (!container || !anchor) return () => {};
    const offset = anchor.offsetTop - container.scrollTop;
    return () => {
      container.scrollTop = anchor.offsetTop - offset;
      updateEnd();
    };
  };
  const scrollViewport = (direction: 'prev' | 'next') => {
    const container = root.current;
    if (!container) return;
    const step = container.clientHeight * 0.85;
    container.scrollTop = Math.max(
      0,
      Math.min(
        container.scrollHeight - container.clientHeight,
        container.scrollTop + (direction === 'next' ? step : -step),
      ),
    );
    updateEnd();
  };
  useImperativeHandle(navigationRef, () => ({
    navigate(target) {
      down.current = null;
      resetMotion();
      if (continuous && (target === 'prev' || target === 'next')) {
        scrollViewport(target);
        onNavigate();
        return true;
      }
      let next: number;
      if (target === 'prev' || target === 'next')
        next = turnComicPage(pageRef.current, pages.length, mode, target);
      else if (/^epubcfi\(\/6\/\d+/.test(target))
        next = comicPageAt({ cfi: target, fraction: 0 }, pages.length);
      else next = pages.findIndex((item) => item.name === target);
      if (next < 0) return false;
      select(next);
      if (continuous) scrollToPage(next);
      onNavigate();
      return true;
    },
  }));
  useLayoutEffect(() => {
    // Keep the selected page, even when it is the second page in a spread.
    restoring.current = true;
    if (continuous) scrollToPage(pageRef.current);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      restoring.current = false;
      updateEnd();
    });
    return () => cancelAnimationFrame(frame.current);
  }, [mode]);
  useEffect(() => {
    const last = comicSpread(page, pages.length, mode).at(-1)!;
    onPosition({
      cfi: comicCFI(page),
      fraction: continuous
        ? atEnd && reachedEnd()
          ? 1
          : Math.min(0.99, pages.length > 1 ? last / (pages.length - 1) : 0)
        : pages.length > 1
          ? last / (pages.length - 1)
          : 1,
      section: `Page ${page + 1}`,
      updatedAt: Date.now(),
    });
  }, [page, pages.length, mode, atEnd]);
  const turn = (direction: 'prev' | 'next') => {
    if (continuous) {
      scrollViewport(direction);
      onNavigate();
      return;
    }
    const next = turnComicPage(pageRef.current, pages.length, mode, direction);
    select(next);
    if (continuous) scrollToPage(next);
    onNavigate();
  };
  const blockedGesture = () =>
    Boolean(window.getSelection()?.toString()) ||
    (window.visualViewport?.scale ?? 1) > 1;
  const finishDrag = (direction?: 'prev' | 'next') => {
    const next = direction
      ? turnComicPage(visiblePage, pages.length, mode, direction)
      : visiblePage;
    const canTurn = !visibleSpread.includes(next) && Boolean(direction);
    const destinationReady = comicSpread(next, pages.length, mode).every(
      (index) => ready.has(index),
    );
    if (!animated || (canTurn && !destinationReady)) {
      resetMotion();
      if (canTurn) turn(direction!);
      return;
    }
    settling.current = true;
    const width = root.current?.getBoundingClientRect().width ?? 0;
    setMotion({
      offset: canTurn ? ((direction === 'next') !== rtl ? -width : width) : 0,
      settling: true,
    });
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      resetMotion();
      if (canTurn) turn(direction!);
    }, 180);
  };
  const cancelDrag = () => {
    const dragging = down.current?.dragging;
    down.current = null;
    if (dragging) finishDrag();
  };
  // Keep every decoded image in its existing keyed slot, including neighboring
  // spreads. Moving the slots never reloads or reparents their image elements.
  const placements = new Map<
    number,
    { left: number; width: number; objectPosition: string }
  >();
  if (!continuous) {
    for (const direction of ['prev', 'next', 'current'] as const) {
      const neighbor =
        direction === 'current'
          ? visiblePage
          : turnComicPage(visiblePage, pages.length, mode, direction);
      if (direction !== 'current' && visibleSpread.includes(neighbor)) continue;
      const spread = comicSpread(neighbor, pages.length, mode);
      const offset =
        direction === 'current'
          ? 0
          : (direction === 'next') !== rtl
            ? 100
            : -100;
      spread.forEach((index, side) => {
        const visualSide = rtl ? spread.length - side - 1 : side;
        placements.set(index, {
          left: offset + (visualSide * 100) / spread.length,
          width: 100 / spread.length,
          objectPosition:
            spread.length === 1
              ? 'center'
              : visualSide === 0
                ? 'right center'
                : 'left center',
        });
      });
    }
  }
  return (
    <div
      ref={root}
      className={`comic-pages ${continuous ? 'comic-webtoon' : 'comic-paged'}`}
      data-direction={rtl ? 'rtl' : 'ltr'}
      data-spread={!continuous && visibleSpread.length === 2}
      data-settling={motion.settling || undefined}
      onScroll={() => {
        if (!continuous || restoring.current) return;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const container = root.current;
          if (!container || restoring.current) return;
          const probe =
            container.scrollTop + Math.min(container.clientHeight * 0.35, 160);
          let closest = 0;
          for (const slot of container.querySelectorAll<HTMLElement>(
            '[data-page]',
          )) {
            if (slot.offsetTop > probe) break;
            closest = Number(slot.dataset.page);
          }
          select(closest);
          updateEnd();
        });
      }}
      onPointerDown={(event) => {
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          settling.current ||
          blockedGesture() ||
          (event.target as HTMLElement).closest(
            'a,button,input,select,textarea,[contenteditable]',
          )
        ) {
          cancelDrag();
          return;
        }
        down.current = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
          id: event.pointerId,
          dragging: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
      onPointerMove={(event) => {
        const start = down.current;
        if (!start || start.id !== event.pointerId) return;
        if (blockedGesture()) {
          cancelDrag();
          return;
        }
        if (
          continuous ||
          preferences.swipeToTurn === false ||
          page !== visiblePage
        )
          return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (
          !start.dragging &&
          (Math.abs(dx) <= 12 || Math.abs(dx) <= Math.abs(dy) * 1.5)
        )
          return;
        start.dragging = true;
        if (!animated) return;
        const direction = dx < 0 !== rtl ? 'next' : 'prev';
        const next = turnComicPage(visiblePage, pages.length, mode, direction);
        const available =
          !visibleSpread.includes(next) &&
          comicSpread(next, pages.length, mode).every((index) =>
            ready.has(index),
          );
        const width = event.currentTarget.getBoundingClientRect().width;
        const offset = Math.max(-width, Math.min(width, dx));
        setMotion({
          offset: available ? offset : offset * 0.15,
          settling: false,
        });
      }}
      onPointerUp={(event) => {
        const start = down.current;
        down.current = null;
        if (!start || start.id !== event.pointerId) return;
        if (blockedGesture()) {
          if (start.dragging) finishDrag();
          return;
        }
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (start.dragging) {
          const threshold = Math.max(
            40,
            event.currentTarget.getBoundingClientRect().width * 0.2,
          );
          finishDrag(
            Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5
              ? dx < 0 !== rtl
                ? 'next'
                : 'prev'
              : undefined,
          );
        } else if (
          !continuous &&
          Math.abs(dx) > 40 &&
          Math.abs(dx) > Math.abs(dy) * 1.5
        ) {
          if (preferences.swipeToTurn !== false)
            turn(dx < 0 !== rtl ? 'next' : 'prev');
        } else if (Math.hypot(dx, dy) < 10 && Date.now() - start.time < 450) {
          const rect = event.currentTarget.getBoundingClientRect();
          const action = tapAction(
            event.clientX - rect.left,
            rect.width,
            rtl,
            preferences,
          );
          if (action === 'prev' || action === 'next') {
            if (preferences.tapToTurn !== false) turn(action);
            else onCenterTap();
          } else if (action === 'controls') onCenterTap();
        }
      }}
    >
      {(continuous
        ? pages.map((_, index) => index)
        : [...retained].sort((a, b) => a - b)
      ).map((index) => (
        <ComicImage
          key={index}
          page={pages[index]}
          index={index}
          continuous={continuous}
          active={retained.has(index)}
          hidden={!continuous && !visibleSpread.includes(index)}
          spreadSide={index === visibleSpread[0] ? 'first' : 'last'}
          placement={
            continuous
              ? undefined
              : placements.has(index)
                ? {
                    left: `${placements.get(index)!.left}%`,
                    width: `${placements.get(index)!.width}%`,
                    transform: `translateX(${motion.offset}px)`,
                    visibility:
                      visibleSpread.includes(index) || ready.has(index)
                        ? 'visible'
                        : 'hidden',
                  }
                : { display: 'none' }
          }
          objectPosition={placements.get(index)?.objectPosition}
          onNear={onNear}
          onSettled={onSettled}
          onReady={onReady}
          root={root}
          dimensions={dimensions.current}
          beforeResize={beforeResize}
          onLoad={() => {
            decoded.current.add(index);
            cancelAnimationFrame(completionFrame.current);
            completionFrame.current = requestAnimationFrame(updateEnd);
            if (restoring.current && continuous) scrollToPage(pageRef.current);
          }}
        />
      ))}
    </div>
  );
}
