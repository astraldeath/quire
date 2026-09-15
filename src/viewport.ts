/** Keep the underlying page steady when a software keyboard resizes the webview. */
export function layoutViewport(
  previous: { width: number; height: number },
  next: { width: number; height: number },
  editing: boolean,
) {
  if (
    editing &&
    Math.abs(previous.width - next.width) < 2 &&
    next.height < previous.height
  )
    return previous;
  return next;
}
export function installViewport() {
  let size = { width: window.innerWidth, height: window.innerHeight };
  const update = () => {
    const editing = !!document.activeElement?.matches(
      'input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]',
    );
    size = layoutViewport(
      size,
      { width: window.innerWidth, height: window.innerHeight },
      editing,
    );
    document.documentElement.style.setProperty(
      '--app-height',
      `${size.height}px`,
    );
  };
  update();
  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
}
