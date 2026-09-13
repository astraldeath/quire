import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { EPUB, type TocItem } from 'foliate-js/epub.js';
import { View } from 'foliate-js/view.js';
import { openArchive } from '../../epub';
import { defaults, type Book, type Position, type ReaderPreferences } from '../../domain/models';
import './reader.css';
import { installReadingInteractions } from './interactions';
import { readerThemeCss, resolveReaderTheme } from './theme';
import { ThemePicker, Segments, StepperControl, Switch, ColorControl } from '../../components/Controls';

interface Props { book: Book; bytes: Uint8Array; preferences: ReaderPreferences; onPreferences(p: ReaderPreferences): void; onPosition(p: Position): void; onClose(): void }
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
function colors(p: ReaderPreferences) {
  const root = document.documentElement;
  return resolveReaderTheme(p, root.dataset.theme, matchMedia('(prefers-color-scheme: dark)').matches, { background: root.style.getPropertyValue('--custom-bg'), foreground: root.style.getPropertyValue('--custom-fg') });
}
export function applyReaderPreferences(view: View, p: ReaderPreferences) {
  if (!view.renderer) return;
  const c = colors(p);
  view.renderer.toggleAttribute('animated', p.animated !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  view.renderer.setAttribute('flow', p.flow === 'paginated' ? 'paginated' : 'scrolled');
  const margin = view.clientWidth > 0 && view.clientWidth < 600 ? Math.min(p.margin, 20) : p.margin;
  view.renderer.setAttribute('margin', `${clamp(margin, 8, 80)}px`);
  view.renderer.setAttribute('gap', `${clamp(margin / 4, 2, 20)}%`);
  view.renderer.setAttribute('max-inline-size', `${clamp(p.maxWidth, 320, 1200)}px`);
  view.renderer.setAttribute('max-column-count', p.columns === 'two' ? '2' : '1');
  const font = p.font === 'sans-serif' ? 'system-ui, sans-serif' : p.font === 'publisher' ? 'inherit' : 'Georgia, Charter, serif';
  view.renderer.setStyles(`${readerThemeCss(c.foreground, c.background)} html { --theme-bg-color: ${c.background}; color: ${c.foreground} !important; background: ${c.background} !important; color-scheme: ${c.dark ? 'dark' : 'light'}; } body { margin: 0 !important; padding: 0 !important; color: ${c.foreground} !important; background: transparent !important; font-size: ${clamp(p.size, 12, 36)}px !important; line-height: ${clamp(p.lineHeight, 1.2, 2.4)} !important; ${p.font !== 'publisher' ? `font-family: ${font} !important;` : ''} } ${!p.publisherStyles ? `p, li, div { font-size: inherit !important; line-height: inherit !important; font-family: inherit !important; color: inherit !important; }` : ''} a { color: inherit; } img, svg { max-width: 100%; }`);
}
function Contents({ items, go, active }: { items: TocItem[]; active: string; go(href: string): void }) {
  return <ol>{items.map((item, index) => <li key={`${item.href}-${index}`}><button aria-current={active === item.href ? 'location' : undefined} onClick={() => go(item.href)}>{item.label || 'Untitled section'}</button>{item.subitems?.length ? <Contents items={item.subitems} go={go} active={active} /> : null}</li>)}</ol>;
}
export function Reader({ book, bytes, preferences, onPreferences, onPosition, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null); const viewRef = useRef<View | null>(null);
  const current = useRef({ preferences, onPosition }); current.current = { preferences, onPosition };
  const [toc, setToc] = useState<TocItem[]>([]); const [panel, setPanel] = useState<'settings' | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const toggleChrome = () => { setChromeVisible(visible => !visible); setContentsOpen(false); setPanel(null); };
  const [chapter, setChapter] = useState(book.position?.section ?? '');
  const [activeHref, setActiveHref] = useState('');
  const [error, setError] = useState(''); const [ready, setReady] = useState(false);
  const [fraction, setFraction] = useState(book.position?.fraction ?? 0);
  const [, redraw] = useState(0);
  const navigate = async (target: 'prev' | 'next' | string) => {
    const view = viewRef.current; if (!view) return false;
    try {
      if (target === 'prev') await view.prev();
      else if (target === 'next') await view.next();
      else {
        const resolved = await view.resolveNavigation(target);
        if (!resolved) throw new Error('The chapter link could not be resolved.');
        await view.renderer.goTo(resolved);
      }
      setError(''); return true;
    } catch (e) { setError(`Could not navigate: ${String(e)}`); return false; }
  };
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    let cancelled = false; let chapterLoaded = false; let epub: EPUB | undefined; const view = new View(); viewRef.current = view;
    setReady(false); setError('');
    view.addEventListener('external-link', event => event.preventDefault());
    view.addEventListener('load', event => {
      chapterLoaded = true;
      const doc = (event as CustomEvent<{ doc: Document }>).detail.doc;
      cleanups.push(installReadingInteractions(doc, view, () => current.current.preferences, message => setError(message), toggleChrome));
      doc.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); void view.next(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); void view.prev(); }
        if (event.key === 'Escape') { setChromeVisible(true); setPanel(null); if (!matchMedia('(min-width: 900px)').matches) setContentsOpen(false); }
      });
    });
    view.addEventListener('relocate', event => {
      // Reflowing controls before a chapter loads must not overwrite a saved locator.
      if (cancelled || !chapterLoaded) return;
      const location = (event as CustomEvent<{ cfi: string; fraction: number; tocItem?: TocItem }>).detail;
      if (!location.cfi) return;
      const fraction = clamp(location.fraction || 0, 0, 1); setFraction(fraction);
      setChapter(location.tocItem?.label ?? ''); setActiveHref(location.tocItem?.href ?? '');
      current.current.onPosition({ cfi: location.cfi, fraction, section: location.tocItem?.label ?? '', updatedAt: Date.now() });
    });
    void (async () => {
      const archive = await openArchive(bytes);
      epub = await new EPUB(archive).init();
      if (cancelled) { epub.destroy(); return; }
      host.current?.append(view); await view.open(epub);
      cleanups.push(installReadingInteractions(view.renderer, view, () => current.current.preferences, message => setError(message), toggleChrome));
      if (cancelled) { try { view.close(); } catch { /* no chapter loaded */ } epub.destroy(); return; }
      applyReaderPreferences(view, current.current.preferences); setToc(epub.toc ?? []);
      await view.init({ lastLocation: book.position?.cfi, showTextStart: !book.position?.cfi });
      if (!cancelled) setReady(true);
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to read this EPUB.'); });
    return () => { cleanups.forEach(cleanup => cleanup()); cancelled = true; viewRef.current = null; try { view.close(); } catch { /* unopened renderer has no view */ } view.remove(); epub?.destroy(); };
  }, [book.id, bytes]);
  useEffect(() => { if (viewRef.current) applyReaderPreferences(viewRef.current, preferences); }, [preferences]);
  useEffect(() => {
    const update = () => { redraw(n => n + 1); if (viewRef.current) applyReaderPreferences(viewRef.current, current.current.preferences); };
    const media = matchMedia('(prefers-color-scheme: dark)'); media.addEventListener('change', update);
    const motion = matchMedia('(prefers-reduced-motion: reduce)'); motion.addEventListener('change', update);
    const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => { media.removeEventListener('change', update); motion.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setChromeVisible(true); setPanel(null); if (!matchMedia('(min-width: 900px)').matches) setContentsOpen(false); }
      if (panel || (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName))) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); navigate('next'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigate('prev'); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [panel]);
  const patch = (value: Partial<ReaderPreferences>) => onPreferences({ ...preferences, ...value });
  const c = colors(preferences);
  return <section className="reader" data-immersive={!chromeVisible} data-contrast={c.contrast} style={{ background: c.background, color: c.foreground, '--bg':c.background, '--surface':c.background, '--fg':c.foreground, '--accent':c.foreground, '--muted':c.foreground, '--line':c.contrast ? '#ffffff' : `${c.foreground}40`, '--hover':c.contrast ? '#000000' : `${c.foreground}18` } as React.CSSProperties} aria-label={`Reading ${book.title}`}>
    <button className="reader-reveal" onClick={() => setChromeVisible(true)}>Show reading controls</button>
    <header className="reader-toolbar" inert={!chromeVisible} aria-hidden={!chromeVisible}><button onClick={onClose} title="Back to library"><ArrowLeft size={19} /><span>Library</span></button><div className="reader-title">{book.title}</div><button aria-label="Table of contents" aria-expanded={contentsOpen} aria-controls="reader-contents" title="Table of contents" onClick={() => setContentsOpen(!contentsOpen)}>{contentsOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button><button aria-label="Reading settings" title="Reading settings" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={20} /></button></header>
    <div className="reader-workspace">
      {contentsOpen && <><button className="contents-backdrop" aria-label="Close contents" onClick={() => setContentsOpen(false)} /><aside id="reader-contents" className="reader-contents" aria-label="Table of contents">
        <div className="reader-panel-heading"><h2>Contents</h2><button aria-label="Close contents sidebar" onClick={() => setContentsOpen(false)}><X /></button></div>
        <div className="contents-book">{book.cover && <img src={book.cover} alt="" />}<div><strong>{book.title}</strong><span>{book.author}</span></div></div>
        <nav aria-label="Chapters">{toc.length ? <Contents items={toc} active={activeHref} go={href => { void navigate(href).then(ok => { if (ok && !matchMedia('(min-width: 900px)').matches) setContentsOpen(false); }); }} /> : <p>{ready ? 'No table of contents in this book.' : 'Loading contents...'}</p>}</nav>
      </aside></>}
      <div className="reader-canvas">
        {error && <p className="reader-error" role="alert">{error}</p>}
        {!ready && !error && <p className="reader-loading" role="status">Opening book...</p>}
        <div className="reader-pages" ref={host} />
        <div className="immersive-chapter" aria-hidden="true">{chapter}</div><div className="immersive-progress" aria-hidden="true">{Math.round(fraction*100)}%</div>
        <footer className="reader-footer" inert={!chromeVisible} aria-hidden={!chromeVisible}><button aria-label="Previous page" title="Previous page" disabled={!ready} onClick={() => navigate('prev')}><ChevronLeft size={22} /></button><div className="reader-progress"><div><span title={chapter}>{chapter || book.title}</span><span>{Math.round(fraction * 100)}%</span></div><progress aria-label="Book progress" value={fraction} max={1} /></div><button aria-label="Next page" title="Next page" disabled={!ready} onClick={() => navigate('next')}><ChevronRight size={22} /></button></footer>
      </div>
    </div>
    {panel && <aside className="reader-panel" aria-label="Reading settings"><div className="reader-panel-heading"><h2>Reading settings</h2><button aria-label="Close panel" title="Close panel" onClick={() => setPanel(null)}><X size={20} /></button></div>
      <div className="reader-settings">
        <ThemePicker label="Reading theme" value={preferences.theme} options={['app','light','dark','onyx','contrast','custom']} onChange={theme=>patch({theme})} />
        {preferences.theme === 'custom' && <><ColorControl label="Text color" value={preferences.foreground} onChange={foreground=>patch({foreground})}/><ColorControl label="Page color" value={preferences.background} onChange={background=>patch({background})}/></>}
        <Segments label="Font" value={preferences.font} options={[{value:'publisher',label:'Publisher'},{value:'Georgia',label:'Serif'},{value:'sans-serif',label:'Sans serif'}]} onChange={font=>patch({font})}/>
        <div className="stepper-group">
        <StepperControl label="Font size" min={12} max={36} value={preferences.size} unit=" px" onChange={size=>patch({size})}/>
        <StepperControl label="Line spacing" min={1.2} max={2.4} step={0.1} value={preferences.lineHeight} onChange={lineHeight=>patch({lineHeight})}/>
        <StepperControl label="Margins" min={8} max={matchMedia('(max-width: 599px)').matches ? 20 : 80} step={4} value={matchMedia('(max-width: 599px)').matches ? Math.min(preferences.margin, 20) : preferences.margin} unit=" px" onChange={margin=>patch({margin})}/>
        <StepperControl label="Text width" min={320} max={1200} step={40} value={preferences.maxWidth} unit=" px" onChange={maxWidth=>patch({maxWidth})}/>
        </div>
        <Segments label="Reading flow" value={preferences.flow} options={[{value:'paginated',label:'Pages'},{value:'scrolled',label:'Chapter scroll'},{value:'continuous',label:'Continuous'}]} onChange={flow=>patch({flow})}/>
        {preferences.flow === 'paginated' && <Segments label="Page layout" value={preferences.columns ?? 'one'} options={[{value:'one',label:'Single page'},{value:'two',label:'Two pages'}]} onChange={columns=>patch({columns})}/>}
        {preferences.flow === 'continuous' && <p className="settings-note">Continue scrolling at a chapter boundary to move to the next or previous chapter.</p>}
        <Switch label="Tap sides to turn pages" checked={preferences.tapToTurn !== false} onChange={tapToTurn=>patch({tapToTurn})}/>
        <Switch label="Swipe to turn pages" checked={preferences.swipeToTurn !== false} onChange={swipeToTurn=>patch({swipeToTurn})}/>
        <Switch label="Page animation" checked={preferences.animated !== false} onChange={animated=>patch({animated})}/>
        <Switch label="Keep publisher formatting" checked={preferences.publisherStyles} onChange={publisherStyles=>patch({publisherStyles})}/>
        <button onClick={() => onPreferences({ ...defaults.reader })}>Reset reading settings</button>
      </div>
    </aside>}
  </section>;
}
