import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { dialogPosition, safeInsets, visualBox } from './dialogPosition';
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    // Dismiss selection UI belonging to the page before opening a new surface.
    document.getSelection()?.removeAllRanges();
    ref.current?.showModal();
    if (document.activeElement?.getAttribute('aria-label') === 'Close dialog')
      ref.current?.focus({ preventScroll: true });
    let resting = visualBox();
    let anchor: number | undefined;
    const update = () => {
      const panel = ref.current;
      if (!panel) return;
      const box = visualBox(),
        safe = safeInsets();
      const editing = !!panel.querySelector(
        'input:focus,textarea:focus,[contenteditable=true]:focus',
      );
      const keyboard =
        Math.abs(box.width - resting.width) <= 24 &&
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
        keyboard ? anchor : undefined,
      );
      if (!keyboard) anchor = position.anchor;
      Object.assign(panel.style, {
        position: 'fixed',
        margin: '0',
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: 'translateX(-50%)',
        maxWidth: `${Math.max(0, box.width - 32)}px`,
        maxHeight: `${position.maxHeight}px`,
      });
      if (keyboard) {
        const body = panel.querySelector<HTMLElement>('.modal-body');
        const field = panel.querySelector<HTMLElement>(
          'input:focus,textarea:focus,[contenteditable=true]:focus',
        );
        if (body && field && body.contains(field)) {
          const bounds = body.getBoundingClientRect(),
            input = field.getBoundingClientRect();
          if (input.bottom > bounds.bottom - 12)
            body.scrollTop += input.bottom - bounds.bottom + 12;
          else if (input.top < bounds.top + 12)
            body.scrollTop -= bounds.top + 12 - input.top;
        }
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
    };
  }, []);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
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
