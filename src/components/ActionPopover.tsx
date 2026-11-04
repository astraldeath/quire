import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { safeInsets, visualBox } from './dialogPosition';
import { positionMenu, type MenuSide } from './menuPosition';

export type ActionAnchor = {
  left: number;
  top: number;
  bottom: number;
  element?: HTMLElement;
};

const phoneMenu = '(max-width: 600px)';
const subscribePhone = (notify: () => void) => {
  const media = window.matchMedia?.(phoneMenu);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
};
const isPhone = () => window.matchMedia?.(phoneMenu).matches ?? false;

export function ActionPopover({
  title,
  anchor,
  onClose,
  children,
  pageKey,
  initialItem,
}: {
  title: string;
  anchor?: ActionAnchor;
  onClose(): void;
  children: ReactNode;
  pageKey?: string;
  initialItem?: string;
}) {
  const mobile = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const ref = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const origin = useRef<ActionAnchor | undefined>(undefined);
  const trigger = useRef<HTMLElement | null>(null);
  const side = useRef<MenuSide | undefined>(undefined);
  const updatePosition = useRef<() => void>(() => {});
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const panel = ref.current!;
    trigger.current =
      anchor?.element ?? (document.activeElement as HTMLElement | null);
    origin.current = anchor ?? trigger.current?.getBoundingClientRect();
    if (mobile) sheet.current?.showModal();
    const update = () => {
      const box = visualBox();
      const safe = safeInsets();
      const left = box.left + 8,
        top = box.top + safe.top + 8;
      const right = box.left + box.width - 8;
      const bottom = box.top + box.height - safe.bottom - 8;
      panel.style.maxWidth = `${Math.max(0, right - left)}px`;
      panel.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      if (mobile && sheet.current) {
        const surface = sheet.current;
        Object.assign(surface.style, {
          width: `${Math.max(0, right - left)}px`,
          maxWidth: `${Math.max(0, right - left)}px`,
          maxHeight: `${Math.max(0, bottom - top)}px`,
          left: `${left}px`,
          margin: '0',
        });
        surface.style.top = `${Math.max(top, bottom - panel.getBoundingClientRect().height)}px`;
        return;
      }
      const size = panel.getBoundingClientRect();
      const position = positionMenu({
        origin: origin.current ?? { left, top, bottom: top },
        viewport: { left, top, right, bottom },
        size,
        side: side.current,
      });
      side.current = position.side;
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
    };
    updatePosition.current = update;
    update();
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update);
    resize?.observe(panel);
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) close.current();
    };
    const scroll = (event: Event) => {
      if (!mobile && !panel.contains(event.target as Node)) close.current();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      resize?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      if (trigger.current?.isConnected)
        trigger.current.focus({ preventScroll: true });
    };
  }, [mobile]);
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    updatePosition.current();
    const items = [
      ...panel.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled):not([hidden])',
      ),
    ];
    const target =
      items.find((item) => item.dataset.menuId === initialItem) ?? items[0];
    target?.focus({ preventScroll: true });
  }, [pageKey, initialItem]);
  const content = (
    <div
      ref={ref}
      className="action-popover"
      role="menu"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Tab' && !mobile)) {
          if (event.key === 'Escape') event.preventDefault();
          onClose();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled):not([hidden])',
          ),
        ];
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[index]?.focus();
      }}
    >
      {mobile && (
        <header className="action-sheet-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon"
            aria-label="Close menu"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
      )}
      {children}
    </div>
  );
  return createPortal(
    mobile ? (
      <dialog
        ref={sheet}
        className="action-sheet"
        aria-label={title}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        {content}
      </dialog>
    ) : (
      content
    ),
    document.body,
  );
}
