export interface ViewportBox {
  top: number;
  left: number;
  width: number;
  height: number;
}
export function dialogPosition(
  viewport: ViewportBox,
  panelHeight: number,
  insets: { top: number; bottom: number },
  anchor?: number,
  placement: 'center' | 'top' = 'center',
) {
  const minimum = insets.top + 12;
  const bottom = insets.bottom + 12;
  const available = Math.max(0, viewport.height - minimum - bottom);
  // Keep an existing top anchor only while enough of the form remains usable.
  // A 120px remainder can hide the focused field beneath the dialog's header.
  const usableHeight = Math.min(
    panelHeight,
    320,
    available,
    Math.max(240, available * 0.75),
  );
  const top =
    anchor === undefined
      ? minimum +
        (placement === 'top'
          ? Math.min(36, available * 0.05)
          : Math.max(0, (available - Math.min(panelHeight, available)) / 2))
      : Math.max(
          minimum,
          Math.min(anchor, viewport.height - bottom - usableHeight),
        );
  return {
    top: viewport.top + top,
    left: viewport.left + viewport.width / 2,
    maxHeight: Math.max(0, viewport.height - top - bottom),
    anchor: top,
  };
}
export function safeInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.append(probe);
  const css = getComputedStyle(probe);
  const insets = {
    top: parseFloat(css.paddingTop) || 0,
    bottom: parseFloat(css.paddingBottom) || 0,
  };
  probe.remove();
  const controls = document.querySelector<HTMLElement>(
    '.desktop-titlebar:not([hidden])',
  );
  if (controls)
    insets.top = Math.max(insets.top, controls.getBoundingClientRect().bottom);
  return insets;
}
export function visualBox(): ViewportBox {
  const vv = window.visualViewport;
  return {
    top: vv?.offsetTop ?? 0,
    left: vv?.offsetLeft ?? 0,
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}
