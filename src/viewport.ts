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

type ViewportSize = { width: number; height: number };
let installedLayout: ViewportSize | undefined;
let keyboardVisible = false;

/** The unoccluded app layout, shared across dialogs and focus transitions. */
export function getLayoutViewport(): ViewportSize | undefined {
  return installedLayout ? { ...installedLayout } : undefined;
}

export function isKeyboardVisible(): boolean {
  return keyboardVisible;
}

export function installViewport() {
  let size = { width: window.innerWidth, height: window.innerHeight };
  let keyboard = false;
  const update = () => {
    const editing = !!document.activeElement?.matches(
      'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]),textarea,[contenteditable=true]',
    );
    const next = { width: window.innerWidth, height: window.innerHeight };
    const visualHeight = window.visualViewport?.height ?? next.height;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const sameOrientation = Math.abs(size.width - next.width) <= 24;
    const loss = size.height - Math.min(next.height, visualHeight);
    if (!coarse || !sameOrientation) {
      keyboard = false;
      size = next;
    } else if (keyboard) {
      // Focus can move to a button or another dialog before dismissal finishes.
      // Keep the baseline until the keyboard animation has actually recovered.
      if (loss <= 2) {
        keyboard = false;
        size = next;
      }
    } else if (editing && loss > 0) {
      // Preserve early animation frames before the loss is large enough to
      // classify as a keyboard; otherwise each frame erodes the baseline.
      keyboard = loss > 80;
    } else {
      size = next;
    }
    installedLayout = size;
    keyboardVisible = keyboard;
    document.documentElement.style.setProperty(
      '--app-height',
      `${size.height}px`,
    );
    document.documentElement.style.setProperty(
      '--visual-height',
      `${visualHeight}px`,
    );
  };
  update();
  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
  return () => {
    window.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('resize', update);
    installedLayout = undefined;
    keyboardVisible = false;
  };
}
