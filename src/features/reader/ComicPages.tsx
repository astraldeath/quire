import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { ReaderBook } from '../../books';
import type { Position, ReaderPreferences } from '../../domain/models';
import {
  comicCFI,
  comicPageAt,
  comicSpread,
  turnComicPage,
} from './comic-navigation';
import { sideTurn } from './interactions';

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
}: {
  page: Page;
  index: number;
  continuous: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  dimensions: Map<number, number>;
  beforeResize(): () => void;
  onLoad(): void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(!continuous);
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
      ([entry]) => setActive(entry.isIntersecting),
      {
        root: root.current,
        rootMargin: '120% 0px',
      },
    );
    observer.observe(element.current!);
    return () => observer.disconnect();
  }, [continuous, root]);
  useEffect(() => {
    if (!active) {
      setSrc('');
      return;
    }
    const url = URL.createObjectURL(page.blob());
    setSrc(url);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [active, page]);
  return (
    <div
      ref={element}
      className="comic-image"
      data-page={index}
      style={continuous ? { aspectRatio: ratio } : undefined}
    >
      {src && !failed && (
        <img
          src={src}
          alt={`Page ${index + 1}`}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            const nextRatio = image.naturalWidth / image.naturalHeight;
            if (Number.isFinite(nextRatio) && nextRatio > 0) {
              if (continuous && nextRatio !== ratio)
                restore.current = beforeResize();
              dimensions.set(index, nextRatio);
              setRatio(nextRatio);
            }
            onLoad();
          }}
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <p role="alert">
          Page {index + 1} could not load.{' '}
          <button
            onClick={() => {
              setActive(false);
              requestAnimationFrame(() => setActive(true));
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
  return (
    <div
      ref={root}
      className={`comic-pages ${continuous ? 'comic-webtoon' : 'comic-paged'}`}
      data-direction={rtl ? 'rtl' : 'ltr'}
      data-spread={
        !continuous && comicSpread(page, pages.length, mode).length === 2
      }
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
          (event.target as HTMLElement).closest('button')
        ) {
          down.current = null;
          return;
        }
        down.current = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
          id: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        down.current = null;
      }}
      onPointerUp={(event) => {
        const start = down.current;
        down.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (preferences.swipeToTurn !== false)
            turn(dx < 0 !== rtl ? 'next' : 'prev');
        } else if (Math.hypot(dx, dy) < 10 && Date.now() - start.time < 450) {
          const rect = event.currentTarget.getBoundingClientRect();
          const direction = sideTurn(
            event.clientX - rect.left,
            rect.width,
            rtl,
          );
          if (direction && preferences.tapToTurn !== false) turn(direction);
          else if (!direction || preferences.tapToTurn === false) onCenterTap();
        }
      }}
    >
      {(continuous
        ? pages.map((_, index) => index)
        : comicSpread(page, pages.length, mode)
      ).map((index) => (
        <ComicImage
          key={`${continuous ? 'scroll' : 'page'}-${index}`}
          page={pages[index]}
          index={index}
          continuous={continuous}
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
