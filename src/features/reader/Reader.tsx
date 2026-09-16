import { ReaderDialog } from './ReaderDialog';
import { ReaderTools } from './ReaderTools';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { EPUB, type TocItem } from 'foliate-js/epub.js';
import { View } from 'foliate-js/view.js';
import { detectBookStructure, openArchive } from '../../epub';
import {
  completedChapterAt,
  inferSeriesVolume,
  type BookStructure,
} from '../../domain/book-structure';
import {
  type Annotation,
  type Book,
  type Position,
  type ReaderPreferences,
} from '../../domain/models';
import './reader.css';
import { installReadingInteractions } from './interactions';
import { readerThemeCss, resolveReaderTheme } from './theme';
import { ReadingSettings } from './ReadingSettings';
import { countVisibleWords, ReadingCollector } from '../statistics/collector';
import type { ReadingActivity } from '../statistics/model';

interface Props {
  book: Book;
  bytes: Uint8Array;
  preferences: ReaderPreferences;
  onPreferences(p: ReaderPreferences): void;
  onPosition(p: Position): void;
  onActivity?(activity: ReadingActivity): void;
  onClose(): void;
  onAnnotations(items: Annotation[]): Promise<void>;
}
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
function colors(p: ReaderPreferences) {
  const root = document.documentElement;
  return resolveReaderTheme(
    p,
    root.dataset.theme,
    matchMedia('(prefers-color-scheme: dark)').matches,
    {
      background: root.style.getPropertyValue('--custom-bg'),
      foreground: root.style.getPropertyValue('--custom-fg'),
    },
  );
}
export function applyReaderPreferences(view: View, p: ReaderPreferences) {
  if (!view.renderer) return;
  const c = colors(p);
  view.renderer.toggleAttribute(
    'animated',
    p.animated !== false &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  view.renderer.setAttribute(
    'flow',
    p.flow === 'paginated' ? 'paginated' : 'scrolled',
  );
  const margin =
    view.clientWidth > 0 && view.clientWidth < 600
      ? Math.min(p.margin, 20)
      : p.margin;
  view.renderer.setAttribute('margin', `${clamp(margin, 8, 80)}px`);
  view.renderer.setAttribute('gap', `${clamp(margin / 4, 2, 20)}%`);
  view.renderer.setAttribute(
    'max-inline-size',
    `${clamp(p.maxWidth, 320, 1200)}px`,
  );
  view.renderer.setAttribute(
    'max-column-count',
    p.columns === 'two' ? '2' : '1',
  );
  const font =
    p.font === 'sans-serif'
      ? 'system-ui, sans-serif'
      : p.font === 'publisher'
        ? 'inherit'
        : 'Georgia, Charter, serif';
  view.renderer.setStyles(
    `${readerThemeCss(c.foreground, c.background)} html { --theme-bg-color: ${c.background}; color: ${c.foreground} !important; background: ${c.background} !important; color-scheme: ${c.dark ? 'dark' : 'light'}; } body { margin: 0 !important; padding: 0 !important; color: ${c.foreground} !important; background: transparent !important; font-size: ${clamp(p.size, 12, 36)}px !important; line-height: ${clamp(p.lineHeight, 1.2, 2.4)} !important; ${p.font !== 'publisher' ? `font-family: ${font} !important;` : ''} } ${!p.publisherStyles ? `p, li, div { font-size: inherit !important; line-height: inherit !important; font-family: inherit !important; color: inherit !important; }` : ''} a { color: inherit; } img, svg { max-width: 100%; }`,
  );
}
function Contents({
  items,
  go,
  active,
}: {
  items: TocItem[];
  active: string;
  go(href: string): void;
}) {
  return (
    <ol>
      {items.map((item, index) => (
        <li key={`${item.href}-${index}`}>
          <button
            aria-current={active === item.href ? 'location' : undefined}
            onClick={() => go(item.href)}
          >
            {item.label || 'Untitled section'}
          </button>
          {item.subitems?.length ? (
            <Contents items={item.subitems} go={go} active={active} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
export function Reader({
  book,
  bytes,
  preferences,
  onPreferences,
  onPosition,
  onActivity,
  onClose,
  onAnnotations,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const footer = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const current = useRef({ preferences, onPosition, onActivity });
  current.current = { preferences, onPosition, onActivity };
  const [toc, setToc] = useState<TocItem[]>([]);
  const [panel, setPanel] = useState<'settings' | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const toggleChrome = () => {
    setChromeVisible((visible) => !visible);
    setContentsOpen(false);
    setPanel(null);
  };
  const [chapter, setChapter] = useState(book.position?.section ?? '');
  const [activeHref, setActiveHref] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [fraction, setFraction] = useState(book.position?.fraction ?? 0);
  const [, redraw] = useState(0);
  const navigate = async (target: 'prev' | 'next' | string) => {
    const view = viewRef.current;
    if (!view) return false;
    try {
      if (target === 'prev') await view.prev();
      else if (target === 'next') await view.next();
      else {
        const resolved = await view.resolveNavigation(target);
        if (!resolved)
          throw new Error('The chapter link could not be resolved.');
        await view.renderer.goTo(resolved);
      }
      setError('');
      setChromeVisible(false);
      setContentsOpen(false);
      setPanel(null);
      return true;
    } catch (e) {
      setError(`Could not navigate: ${String(e)}`);
      return false;
    }
  };
  useLayoutEffect(() => {
    const update = () => {
      if (!root.current || !toolbar.current || !footer.current) return;
      root.current.style.setProperty(
        '--reader-header-space',
        `${Math.ceil(toolbar.current.getBoundingClientRect().height)}px`,
      );
      root.current.style.setProperty(
        '--reader-footer-space',
        `${Math.ceil(footer.current.getBoundingClientRect().height)}px`,
      );
    };
    const observer = new ResizeObserver(update);
    if (toolbar.current) observer.observe(toolbar.current);
    if (footer.current) observer.observe(footer.current);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    let cancelled = false;
    let chapterLoaded = false;
    let epub: EPUB | undefined;
    let structure: BookStructure = { chapters: [] };
    let locationHref = '';
    let forwardUntil = 0;
    const collector = new ReadingCollector(
      book.id,
      inferSeriesVolume(book.title, '', book).volume,
      Date.now(),
      performance.now(),
    );
    const available = () =>
      document.visibilityState !== 'hidden' &&
      !document.querySelector('[role="dialog"], #reader-contents');
    const syncAvailability = () =>
      collector.setAvailable(available(), performance.now());
    const flushActivity = () => {
      for (const activity of collector.flush(performance.now()))
        current.current.onActivity?.(activity);
    };
    const interaction = () => {
      syncAvailability();
      collector.interact(performance.now());
    };
    const observeInteractions = (target: Document | HTMLElement) => {
      const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
      events.forEach((name) =>
        target.addEventListener(name, interaction, {
          capture: true,
          passive: true,
        }),
      );
      cleanups.push(() =>
        events.forEach((name) =>
          target.removeEventListener(name, interaction, true),
        ),
      );
    };
    observeInteractions(document);
    syncAvailability();
    const visibility = () => {
      syncAvailability();
      flushActivity();
    };
    const pagehide = () => {
      collector.setAvailable(false, performance.now());
      flushActivity();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', visibility);
    const dialogObserver = new MutationObserver(syncAvailability);
    dialogObserver.observe(document.body, { childList: true, subtree: true });
    const activityTimer = window.setInterval(() => {
      syncAvailability();
      flushActivity();
    }, 30000);
    cleanups.push(() => {
      window.clearInterval(activityTimer);
      dialogObserver.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', visibility);
      flushActivity();
    });
    const view = new View();
    const next = view.next.bind(view);
    view.next = () => {
      forwardUntil = performance.now() + 2500;
      return next();
    };
    viewRef.current = view;
    setReady(false);
    setError('');
    view.addEventListener('external-link', (event) => event.preventDefault());
    view.addEventListener('load', (event) => {
      chapterLoaded = true;
      const doc = (event as CustomEvent<{ doc: Document }>).detail.doc;
      observeInteractions(doc);
      cleanups.push(
        installReadingInteractions(
          doc,
          view,
          () => current.current.preferences,
          (message) => setError(message),
          toggleChrome,
        ),
      );
      doc.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          void view.next();
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          void view.prev();
        }
        if (event.key === 'Escape') {
          setChromeVisible(true);
          setPanel(null);
          if (!matchMedia('(min-width: 900px)').matches) setContentsOpen(false);
        }
      });
    });
    view.addEventListener('relocate', (event) => {
      // Reflowing controls before a chapter loads must not overwrite a saved locator.
      if (cancelled || !chapterLoaded) return;
      const location = (
        event as CustomEvent<{
          cfi: string;
          fraction: number;
          tocItem?: TocItem;
          section?: { current: number };
        }>
      ).detail;
      if (!location.cfi) return;
      const fraction = clamp(location.fraction || 0, 0, 1);
      setFraction(fraction);
      setChapter(location.tocItem?.label ?? '');
      setActiveHref(location.tocItem?.href ?? '');
      locationHref = location.tocItem?.href ?? '';
      const completedChapter = completedChapterAt(structure, {
        spineIndex: location.section?.current ?? -1,
        href: location.tocItem?.href,
        atEnd: view.renderer.atEnd,
      });
      current.current.onPosition({
        cfi: location.cfi,
        fraction,
        section: location.tocItem?.label ?? '',
        ...(completedChapter !== null ? { completedChapter } : {}),
        updatedAt: Date.now(),
      });
    });
    void (async () => {
      const archive = await openArchive(bytes);
      structure = detectBookStructure(archive);
      epub = await new EPUB(archive).init();
      if (cancelled) {
        epub.destroy();
        return;
      }
      host.current?.append(view);
      await view.open(epub);
      view.renderer.addEventListener('relocate', (event) => {
        const detail = (
          event as CustomEvent<{
            reason?: string;
            range?: Range;
            index: number;
            fraction?: number;
            size?: number;
          }>
        ).detail;
        const { reason } = detail;
        syncAvailability();
        if (
          detail.range &&
          Number.isFinite(detail.fraction) &&
          // A turn across a spine boundary briefly exposes an empty trailing page.
          !((detail.fraction ?? 0) >= 1 && !view.renderer.atEnd)
        ) {
          const chapter =
            structure.chapters.find((item) =>
              item.hrefs.includes(locationHref),
            ) ??
            structure.chapters.find(
              (item) =>
                item.startSpineIndex <= detail.index &&
                item.endSpineIndex >= detail.index,
            );
          const words = countVisibleWords(detail.range.toString());
          collector.relocate(
            {
              key: view.getCFI(detail.index, detail.range),
              index: detail.index,
              fraction: detail.fraction ?? 0,
              size:
                current.current.preferences.flow === 'paginated'
                  ? (detail.size ?? 0)
                  : 0,
              words,
              chapter: chapter?.number ?? null,
              atEnd:
                view.renderer.atEnd &&
                (current.current.preferences.flow === 'paginated' ||
                  view.renderer.viewSize - view.renderer.end <= 2),
              reason,
              forwardIntent: performance.now() < forwardUntil,
            },
            performance.now(),
          );
          forwardUntil = 0;
        }
        if (reason === 'page' || reason === 'snap' || reason === 'scroll') {
          setChromeVisible(false);
          setPanel(null);
        }
      });
      cleanups.push(
        installReadingInteractions(
          view.renderer,
          view,
          () => current.current.preferences,
          (message) => setError(message),
          toggleChrome,
        ),
      );
      if (cancelled) {
        try {
          view.close();
        } catch {
          /* no chapter loaded */
        }
        epub.destroy();
        return;
      }
      applyReaderPreferences(view, current.current.preferences);
      setToc(epub.toc ?? []);
      await view.init({
        lastLocation: book.position?.cfi,
        showTextStart: !book.position?.cfi,
      });
      if (!cancelled) setReady(true);
    })().catch((e) => {
      if (!cancelled)
        setError(e instanceof Error ? e.message : 'Unable to read this EPUB.');
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      cancelled = true;
      viewRef.current = null;
      try {
        view.close();
      } catch {
        /* unopened renderer has no view */
      }
      view.remove();
      epub?.destroy();
    };
  }, [book.id, bytes]);
  useEffect(() => {
    if (viewRef.current) applyReaderPreferences(viewRef.current, preferences);
  }, [preferences]);
  useEffect(() => {
    const update = () => {
      redraw((n) => n + 1);
      if (viewRef.current)
        applyReaderPreferences(viewRef.current, current.current.preferences);
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });
    return () => {
      media.removeEventListener('change', update);
      motion.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChromeVisible(true);
        setPanel(null);
        if (!matchMedia('(min-width: 900px)').matches) setContentsOpen(false);
      }
      if (
        panel ||
        (event.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName))
      )
        return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigate('next');
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate('prev');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [panel]);
  const c = colors(preferences);
  return (
    <section
      ref={root}
      className="reader"
      data-immersive={!chromeVisible}
      data-contrast={c.contrast}
      style={
        {
          background: c.background,
          color: c.foreground,
          '--bg': c.background,
          '--surface': c.background,
          '--fg': c.foreground,
          '--accent': c.foreground,
          '--muted': c.foreground,
          '--line': c.contrast ? '#ffffff' : `${c.foreground}40`,
          '--hover': c.contrast ? '#000000' : `${c.foreground}18`,
        } as React.CSSProperties
      }
      aria-label={`Reading ${book.title}`}
    >
      <button className="reader-reveal" onClick={() => setChromeVisible(true)}>
        Show reading controls
      </button>
      <header
        ref={toolbar}
        className="reader-toolbar"
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
      >
        <button onClick={onClose} title="Back to library">
          <ArrowLeft size={19} />
          <span>Library</span>
        </button>
        <div className="reader-title">{book.title}</div>
        <button
          aria-label="Table of contents"
          aria-expanded={contentsOpen}
          aria-controls="reader-contents"
          title="Table of contents"
          onClick={() => setContentsOpen(!contentsOpen)}
        >
          {contentsOpen ? (
            <PanelLeftClose size={20} />
          ) : (
            <PanelLeftOpen size={20} />
          )}
        </button>
        <button
          aria-label="Reading settings"
          title="Reading settings"
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
        >
          <Settings2 size={20} />
        </button>
      </header>
      <div className="reader-workspace">
        {contentsOpen && (
          <>
            <button
              className="contents-backdrop"
              aria-label="Close contents"
              onClick={() => setContentsOpen(false)}
            />
            <aside
              id="reader-contents"
              className="reader-contents"
              aria-label="Table of contents"
            >
              <div className="reader-panel-heading">
                <h2>Contents</h2>
                <button
                  aria-label="Close contents sidebar"
                  onClick={() => setContentsOpen(false)}
                >
                  <X />
                </button>
              </div>
              <div className="contents-book">
                {book.cover && <img src={book.cover} alt="" />}
                <div>
                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                </div>
              </div>
              <nav aria-label="Chapters">
                {toc.length ? (
                  <Contents
                    items={toc}
                    active={activeHref}
                    go={(href) => {
                      void navigate(href).then((ok) => {
                        if (ok && !matchMedia('(min-width: 900px)').matches)
                          setContentsOpen(false);
                      });
                    }}
                  />
                ) : (
                  <p>
                    {ready
                      ? 'No table of contents in this book.'
                      : 'Loading contents...'}
                  </p>
                )}
              </nav>
            </aside>
          </>
        )}
        <div className="reader-canvas">
          {error && (
            <p className="reader-error" role="alert">
              {error}
            </p>
          )}
          {!ready && !error && (
            <p className="reader-loading" role="status">
              Opening book...
            </p>
          )}
          <div className="reader-pages" ref={host} />
          <div className="immersive-chapter" aria-hidden="true">
            {chapter}
          </div>
          <div className="immersive-progress" aria-hidden="true">
            {Math.round(fraction * 100)}%
          </div>
          <footer
            ref={footer}
            className="reader-footer"
            inert={!chromeVisible}
            aria-hidden={!chromeVisible}
          >
            <button
              aria-label="Previous page"
              title="Previous page"
              disabled={!ready}
              onClick={() => navigate('prev')}
            >
              <ChevronLeft size={22} />
            </button>
            <div className="reader-progress">
              <div>
                <span title={chapter}>{chapter || book.title}</span>
                <span>{Math.round(fraction * 100)}%</span>
              </div>
              <progress aria-label="Book progress" value={fraction} max={1} />
            </div>
            <button
              aria-label="Next page"
              title="Next page"
              disabled={!ready}
              onClick={() => navigate('next')}
            >
              <ChevronRight size={22} />
            </button>
          </footer>
        </div>
      </div>
      {ready && viewRef.current && (
        <ReaderTools
          otherPanelOpen={!!panel || contentsOpen}
          onOpen={() => {
            setPanel(null);
            setContentsOpen(false);
          }}
          toolbar={toolbar.current!}
          view={viewRef.current}
          book={book}
          visible={chromeVisible}
          onSave={onAnnotations}
          navigate={navigate}
        />
      )}
      {panel && (
        <ReaderDialog label="Reading settings" onClose={() => setPanel(null)}>
          <div className="reader-panel-heading">
            <h2>Reading settings</h2>
            <button
              aria-label="Close panel"
              title="Close panel"
              onClick={() => setPanel(null)}
            >
              <X size={20} />
            </button>
          </div>
          <ReadingSettings
            preferences={preferences}
            onPreferences={onPreferences}
          />
        </ReaderDialog>
      )}
    </section>
  );
}
