import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { dialogPosition, safeInsets, visualBox } from './dialogPosition';
import { scrollFocusedField } from './scrollFocusedField';
import { getLayoutViewport, isKeyboardVisible } from '../viewport';
export function Modal({
  title,
  onClose,
  children,
  initialFocus,
  focusKey,
  className,
  placement = 'center',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  focusKey?: string;
  className?: string;
  placement?: 'center' | 'top';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    // Dismiss selection UI belonging to the page before opening a new surface.
    document.getSelection()?.removeAllRanges();
    ref.current?.showModal();
    if (document.activeElement?.getAttribute('aria-label') === 'Close dialog')
      ref.current?.focus({ preventScroll: true });
    let resting = { ...visualBox(), ...getLayoutViewport() };
    let anchor: number | undefined;
    const update = () => {
      const panel = ref.current;
      if (!panel) return;
      const box = visualBox(),
        safe = safeInsets();
      const editing = !!panel.querySelector(
        'input:focus,textarea:focus,[contenteditable=true]:focus',
      );
      const keyboard = getLayoutViewport()
        ? isKeyboardVisible()
        : Math.abs(box.width - resting.width) <= 24 &&
          (box.height < resting.height - 80 ||
            (editing && box.height < resting.height));
      if (!keyboard) {
        resting = box;
        panel.style.maxHeight = `${Math.max(0, box.height - safe.top - safe.bottom - 24)}px`;
      }
      const position = dialogPosition(
        box,
        panel.getBoundingClientRect().height,
        safe,
        keyboard
          ? (anchor ?? (box.width <= 600 ? safe.top + 12 : undefined))
          : undefined,
        placement,
      );
      const mobilePage =
        box.width <= 600 &&
        panel.matches(
          '.tracking-modal, :has(.settings-layout), :has(.book-details-edit)',
        );
      if (mobilePage && (!keyboard || anchor === undefined)) {
        position.top = box.top + safe.top + 8;
        position.maxHeight = Math.max(
          0,
          box.height - safe.top - safe.bottom - 16,
        );
        position.anchor = safe.top + 8;
      }
      if (!keyboard) anchor = position.anchor;
      Object.assign(panel.style, {
        position: 'fixed',
        margin: '0',
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: 'translateX(-50%)',
        maxWidth: `${Math.max(0, box.width - (mobilePage ? 16 : 32))}px`,
        maxHeight: `${position.maxHeight}px`,
      });
      if (keyboard) {
        scrollFocusedField(panel);
      }
    };
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update);
    if (ref.current) resize?.observe(ref.current);
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('quire-window-controls', update);
    const panel = ref.current;
    panel?.addEventListener('focusin', update);
    return () => {
      panel?.removeEventListener('focusin', update);
      if (panel?.contains(document.activeElement))
        (document.activeElement as HTMLElement)?.blur();
      const selected = document.getSelection();
      if (selected?.anchorNode && panel?.contains(selected.anchorNode))
        selected.removeAllRanges();
      resize?.disconnect();
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('quire-window-controls', update);
    };
  }, [placement]);
  useLayoutEffect(() => {
    initialFocus?.current?.focus({ preventScroll: true });
  }, [focusKey, initialFocus]);
  return (
    <dialog
      ref={ref}
      className={className}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon" aria-label="Close dialog" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
