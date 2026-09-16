import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { safeInsets, visualBox } from '../../components/dialogPosition';
import { selectionPosition, visibleSelectionBox } from './selectionPosition';

export function SelectionToolbar({
  range,
  doc,
  children,
}: {
  range: Range;
  doc: Document;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current!;
    const update = () => {
      const box = visualBox(),
        safe = safeInsets();
      const viewport = {
        ...box,
        top: box.top + safe.top,
        height: Math.max(0, box.height - safe.top - safe.bottom),
      };
      const bounds = visibleSelectionBox(range, doc, viewport);
      bar.style.visibility = bounds ? 'visible' : 'hidden';
      if (!bounds) return;
      bar.style.maxWidth = `${Math.max(0, viewport.width - 20)}px`;
      const position = selectionPosition(
        bounds,
        bar.getBoundingClientRect(),
        viewport,
      );
      bar.style.left = `${position.left}px`;
      bar.style.top = `${position.top}px`;
    };
    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(bar);
    const frame = doc.defaultView?.frameElement;
    const root = frame?.getRootNode() ?? document;
    root.addEventListener('scroll', update, true);
    doc.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer?.disconnect();
      root.removeEventListener('scroll', update, true);
      doc.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [range, doc]);
  return (
    <div
      ref={ref}
      className="selection-tools"
      role="toolbar"
      aria-label="Selected text actions"
      onPointerDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
