import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { safeInsets, visualBox } from './dialogPosition';

export type ActionAnchor = { left: number; top: number; bottom: number };

export function ActionPopover({
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
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const panel = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const origin = anchor ?? previous?.getBoundingClientRect();
    const update = () => {
      const box = visualBox();
      const safe = safeInsets();
      const left = box.left + 8,
        top = box.top + safe.top + 8;
      const right = box.left + box.width - 8;
      const bottom = box.top + box.height - safe.bottom - 8;
      panel.style.maxWidth = `${Math.max(0, right - left)}px`;
      panel.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      const size = panel.getBoundingClientRect();
      const below = (origin?.bottom ?? top) + 4;
      const y =
        below + size.height <= bottom
          ? below
          : (origin?.top ?? bottom) - size.height - 4;
      panel.style.left = `${Math.max(left, Math.min(origin?.left ?? left, right - size.width))}px`;
      panel.style.top = `${Math.max(top, Math.min(y, bottom - size.height))}px`;
    };
    panel
      .querySelectorAll('button')
      .forEach((button) => button.setAttribute('role', 'menuitem'));
    update();
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update);
    resize?.observe(panel);
    panel
      .querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) close.current();
    };
    const scroll = (event: Event) => {
      if (!panel.contains(event.target as Node)) close.current();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      resize?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      className="action-popover"
      role="menu"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          onClose();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
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
      {children}
    </div>,
    document.body,
  );
}
