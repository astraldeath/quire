import type { ViewportBox } from '../../components/dialogPosition';
type Box = { left: number; right: number; top: number; bottom: number };
export function selectionPosition(
  selection: Box,
  size: { width: number; height: number },
  viewport: ViewportBox,
) {
  const edge = 10,
    gap = 20;
  const minX = viewport.left + edge,
    maxX = viewport.left + viewport.width - size.width - edge;
  const minY = viewport.top + edge,
    maxY = viewport.top + viewport.height - size.height - edge;
  const above = selection.top - gap - size.height;
  const below = selection.bottom + gap;
  const y =
    above >= minY
      ? above
      : below <= maxY
        ? below
        : selection.top - viewport.top >
            viewport.top + viewport.height - selection.bottom
          ? minY
          : maxY;
  return {
    left: Math.max(
      minX,
      Math.min((selection.left + selection.right - size.width) / 2, maxX),
    ),
    top: Math.max(minY, Math.min(y, maxY)),
  };
}

/** Translate the visible range fragments out of Foliate's scrolled iframe. */
export function visibleSelectionBox(
  range: Range,
  doc: Document,
  viewport: ViewportBox,
): Box | null {
  const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
  const dx = frame?.left ?? 0,
    dy = frame?.top ?? 0;
  const minX = Math.max(viewport.left, frame?.left ?? -Infinity);
  const maxX = Math.min(
    viewport.left + viewport.width,
    frame?.right ?? Infinity,
  );
  const minY = Math.max(viewport.top, frame?.top ?? -Infinity);
  const maxY = Math.min(
    viewport.top + viewport.height,
    frame?.bottom ?? Infinity,
  );
  const rects =
    typeof range.getClientRects === 'function'
      ? Array.from(range.getClientRects())
      : [];
  const visible = rects
    .map((r) => ({
      left: Math.max(minX, r.left + dx),
      right: Math.min(maxX, r.right + dx),
      top: Math.max(minY, r.top + dy),
      bottom: Math.min(maxY, r.bottom + dy),
    }))
    .filter((r) => r.right > r.left && r.bottom > r.top);
  if (!visible.length) return null;
  return {
    left: Math.min(...visible.map((r) => r.left)),
    right: Math.max(...visible.map((r) => r.right)),
    top: Math.min(...visible.map((r) => r.top)),
    bottom: Math.max(...visible.map((r) => r.bottom)),
  };
}
