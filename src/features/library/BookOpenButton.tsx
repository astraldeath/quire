import type { ActionAnchor } from '../../components/ActionPopover';
import { holdFeedback } from './haptics';
import { useEffect, useRef, type ReactNode } from 'react';
export function BookOpenButton({
  label,
  onOpen,
  onActions,
  children,
  href,
}: {
  href?: string;
  label: string;
  onOpen(): void;
  onActions(anchor: ActionAnchor): void;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => cancel, []);
  const Element = href ? 'a' : 'button';
  return (
    <Element
      href={href}
      className="book-open"
      aria-label={label}
      aria-haspopup="menu"
      onPointerDown={(e) => {
        cancel();
        held.current = false;
        if (e.pointerType === 'mouse' || !e.isPrimary) return;
        start.current = { x: e.clientX, y: e.clientY };
        const point = { left: e.clientX, top: e.clientY, bottom: e.clientY };
        e.currentTarget.focus({ preventScroll: true });
        timer.current = setTimeout(() => {
          held.current = true;
          start.current = null;
          holdFeedback();
          onActions(point);
        }, 500);
      }}
      onPointerMove={(e) => {
        if (
          start.current &&
          Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) >
            10
        )
          cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        const touchHold = !!start.current;
        cancel();
        if (!held.current) {
          held.current = true;
          if (touchHold) holdFeedback();
          e.currentTarget.focus({ preventScroll: true });
          onActions({ left: e.clientX, top: e.clientY, bottom: e.clientY });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') held.current = false;
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          cancel();
          held.current = true;
          onActions(e.currentTarget.getBoundingClientRect());
        }
      }}
      onClick={(e) => {
        if (href && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
        e.preventDefault();
        if (held.current) {
          e.preventDefault();
          held.current = false;
          return;
        }
        onOpen();
      }}
    >
      {children}
    </Element>
  );
}
