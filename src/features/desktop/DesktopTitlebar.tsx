import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  desktopWindow,
  type DesktopWindowState,
  type WindowAction,
} from './window';
import './desktop.css';

function ModalWindowLayer({
  dialog,
  libraryHeader,
  onFailure,
  children,
}: {
  dialog: HTMLDialogElement;
  libraryHeader: HTMLElement | null;
  onFailure: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const size = () => {
      layer.style.height = `${libraryHeader?.getBoundingClientRect().height || 34}px`;
    };
    size();
    try {
      layer.showPopover();
    } catch {
      onFailure();
      return;
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(size);
    if (libraryHeader) observer?.observe(libraryHeader);
    window.addEventListener('resize', size);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', size);
      try {
        layer.hidePopover();
      } catch {
        /* Closing a dialog may already remove its top layer. */
      }
    };
  }, [dialog, libraryHeader, onFailure]);
  // Descending from the active dialog avoids modal inertness. The popover top
  // layer also escapes that dialog's transform, clipping, and scroll position.
  return createPortal(
    <div ref={ref} popover="manual" className="desktop-modal-window-layer">
      {children}
    </div>,
    dialog,
  );
}

export function DesktopTitlebar() {
  const [state, setState] = useState<DesktopWindowState | null>(null);
  const [failed, setFailed] = useState(false);
  const [libraryHeader, setLibraryHeader] = useState<HTMLElement | null>(null);
  const [activeDialog, setActiveDialog] = useState<HTMLDialogElement | null>(
    null,
  );
  const layerFailure = useCallback(() => setFailed(true), []);
  const queued = useRef(Promise.resolve());
  const control = useRef<(action: WindowAction) => void>(() => {});
  useEffect(() => {
    let alive = true;
    desktopWindow()
      .then((value) => {
        if (alive) setState(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const desktop = !!state?.desktop;
  useEffect(() => {
    if (!desktop) return;
    let stack: HTMLDialogElement[] = [];
    const updateDialogs = (records: MutationRecord[] = []) => {
      const open = Array.from(
        document.querySelectorAll<HTMLDialogElement>('dialog[open]'),
      );
      stack = stack.filter((dialog) => open.includes(dialog));
      for (const dialog of open)
        if (!stack.includes(dialog)) stack.push(dialog);
      for (const record of records) {
        if (
          record.attributeName === 'open' &&
          record.target instanceof HTMLDialogElement &&
          record.target.open
        ) {
          stack = stack.filter((dialog) => dialog !== record.target);
          stack.push(record.target);
        }
      }
      setActiveDialog(stack.at(-1) ?? null);
    };
    updateDialogs();
    const observer = new MutationObserver(updateDialogs);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, [desktop]);
  useEffect(() => {
    if (!desktop) return;
    const locate = () =>
      setLibraryHeader(
        window.innerWidth >= 900
          ? document.querySelector<HTMLElement>('.library-shell > .topbar')
          : null,
      );
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', locate);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', locate);
    };
  }, [desktop]);
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    let stopped = false;
    const enqueue = (operation: () => Promise<void>) => {
      queued.current = queued.current.then(operation);
    };
    const fallback = async () => {
      stopped = true;
      await desktopWindow('native').catch(() => {});
      if (alive) {
        setFailed(true);
        setState(null);
      }
    };
    const run = (action: WindowAction) => {
      enqueue(async () => {
        if (!alive || stopped) return;
        try {
          const next = await desktopWindow(action);
          if (alive && !stopped && action !== 'close') setState(next);
        } catch {
          await fallback();
        }
      });
    };
    control.current = run;
    const sync = () => {
      enqueue(async () => {
        if (!alive || stopped) return;
        try {
          const current = await desktopWindow();
          if (!alive || stopped) return;
          const decorated = failed;
          const next =
            current && current.decorated !== decorated
              ? await desktopWindow(decorated ? 'native' : 'custom')
              : current;
          if (alive && !stopped) setState(next);
        } catch {
          await fallback();
        }
      });
    };
    // This effect runs only after the titlebar's first DOM commit.
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('focus', sync);
    return () => {
      alive = false;
      control.current = () => {};
      window.removeEventListener('resize', sync);
      window.removeEventListener('focus', sync);
      // Finish any in-flight mutation before restoring decorations. The shared
      // queue also orders this cleanup before a replacement effect can enable
      // the custom frame again.
      enqueue(async () => {
        await desktopWindow('native').catch(() => {});
      });
    };
  }, [desktop, failed]);

  const visible = !!state && !failed && !state.fullscreen && !state.decorated;
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute(
      'data-desktop-titlebar',
      visible && !libraryHeader,
    );
    window.dispatchEvent(new Event('quire-window-controls'));
    return () =>
      document.documentElement.removeAttribute('data-desktop-titlebar');
  }, [visible, libraryHeader]);
  useEffect(() => {
    if (!libraryHeader || !visible) return;
    libraryHeader.classList.add('desktop-library-header');
    const drag = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        event.target.closest(
          'button,input,a,select,textarea,label,[role="button"],[contenteditable]',
        )
      )
        return;
      event.preventDefault();
      control.current(event.detail === 2 ? 'maximize' : 'drag');
    };
    libraryHeader.addEventListener('mousedown', drag);
    return () => {
      libraryHeader.classList.remove('desktop-library-header');
      libraryHeader.removeEventListener('mousedown', drag);
    };
  }, [libraryHeader, visible]);

  const act = (action: WindowAction) => control.current(action);
  if (!state || failed) return null;
  const bar = (modal = false) => (
    <header
      className={`desktop-titlebar${libraryHeader ? ' desktop-titlebar-integrated' : ''}${modal ? ' desktop-titlebar-modal' : ''}`}
      aria-label="Window controls"
      hidden={!visible}
    >
      {(!libraryHeader || modal) && (
        <div
          className="desktop-titlebar-drag"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void act(event.detail === 2 ? 'maximize' : 'drag');
          }}
        >
          {!libraryHeader && <span>Quire</span>}
        </div>
      )}
      <button
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void act('minimize')}
      >
        <Minus />
      </button>
      <button
        aria-label={state.maximized ? 'Restore window' : 'Maximize window'}
        title={state.maximized ? 'Restore' : 'Maximize'}
        onClick={() => void act('maximize')}
      >
        {state.maximized ? <Copy /> : <Square />}
      </button>
      <button
        className="desktop-titlebar-close"
        aria-label="Close window"
        title="Close"
        onClick={() => void act('close')}
      >
        <X strokeWidth={1.5} />
      </button>
    </header>
  );
  return (
    <>
      {libraryHeader ? createPortal(bar(), libraryHeader) : bar()}
      {visible && activeDialog && (
        <ModalWindowLayer
          dialog={activeDialog}
          libraryHeader={libraryHeader}
          onFailure={layerFailure}
        >
          {bar(true)}
        </ModalWindowLayer>
      )}
    </>
  );
}
