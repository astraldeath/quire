import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ActionAnchor } from './ActionPopover';
import { safeInsets, visualBox } from './dialogPosition';
import { positionMenu, type MenuSide } from './menuPosition';

const focusable =
  'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href],[tabindex]:not([tabindex="-1"])';

export function OptionsPanel({
  title,
  anchor,
  onClose,
  children,
}: {
  title: string;
  anchor?: ActionAnchor;
  onClose(): void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const side = useRef<MenuSide | undefined>(undefined);
  useLayoutEffect(() => {
    const dialog = panel.current!;
    trigger.current =
      anchor?.element ?? (document.activeElement as HTMLElement | null);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
    const update = () => {
      const box = visualBox();
      const safe = safeInsets();
      const left = box.left + 8;
      const top = box.top + safe.top + 8;
      const right = box.left + box.width - 8;
      const bottom = box.top + box.height - safe.bottom - 8;
      dialog.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      if (box.width <= 540) {
        const height = Math.min(
          dialog.getBoundingClientRect().height,
          Math.max(0, bottom - top),
        );
        Object.assign(dialog.style, {
          position: 'fixed',
          margin: '0',
          left: `${left}px`,
          top: `${Math.max(top, bottom - height)}px`,
          bottom: 'auto',
          width: `${Math.max(0, right - left)}px`,
          maxWidth: `${Math.max(0, right - left)}px`,
        });
        return;
      }
      dialog.style.width = '';
      dialog.style.bottom = 'auto';
      const origin = anchor ?? trigger.current?.getBoundingClientRect();
      const position = positionMenu({
        origin: origin ?? { left, top, bottom: top },
        viewport: { left, top, right, bottom },
        size: dialog.getBoundingClientRect(),
        side: side.current,
      });
      side.current = position.side;
      Object.assign(dialog.style, {
        position: 'fixed',
        margin: '0',
        left: `${position.left}px`,
        top: `${position.top}px`,
        maxWidth: `${Math.max(0, right - left)}px`,
      });
    };
    update();
    panel.current
      ?.querySelector<HTMLElement>(focusable)
      ?.focus({ preventScroll: true });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      const origin = trigger.current;
      queueMicrotask(() => {
        if (origin?.isConnected) origin.focus({ preventScroll: true });
      });
    };
  }, []);
  return createPortal(
    <dialog
      ref={panel}
      className="options-panel"
      role="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(focusable),
        ];
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="options-panel-inner">
        <header>
          <h2>{title}</h2>
        </header>
        <div className="options-panel-body">{children}</div>
        <footer>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
