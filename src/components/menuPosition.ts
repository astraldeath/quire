export type MenuSide = 'above' | 'below';

export function positionMenu({
  origin,
  viewport,
  size,
  side,
}: {
  origin: { left: number; top: number; bottom: number };
  viewport: { left: number; top: number; right: number; bottom: number };
  size: { width: number; height: number };
  side?: MenuSide;
}): { left: number; top: number; side: MenuSide } {
  const gap = 4;
  const resolvedSide =
    side ??
    (origin.bottom + gap + size.height <= viewport.bottom ? 'below' : 'above');
  const desiredTop =
    resolvedSide === 'below'
      ? origin.bottom + gap
      : origin.top - size.height - gap;
  return {
    left: Math.max(
      viewport.left,
      Math.min(origin.left, viewport.right - size.width),
    ),
    top: Math.max(
      viewport.top,
      Math.min(desiredTop, viewport.bottom - size.height),
    ),
    side: resolvedSide,
  };
}
