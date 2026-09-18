let systemDialogs = 0;
const changed = 'quire-system-dialog';

/** Keep Quire's own pickers and authentication prompts from triggering a cover. */
export async function withSystemDialog<T>(
  action: () => Promise<T>,
): Promise<T> {
  systemDialogs++;
  window.dispatchEvent(new Event(changed));
  try {
    return await action();
  } finally {
    systemDialogs--;
    window.dispatchEvent(new Event(changed));
  }
}

export function watchInactive(cover: (value: boolean) => void) {
  let focused = document.hasFocus();
  let picker = false;
  let downloadTimer: ReturnType<typeof setTimeout> | undefined;
  const update = () => cover(!focused && !picker && systemDialogs === 0);
  const blur = () => {
    // Moving into the EPUB iframe also blurs its parent window.
    focused = document.hasFocus();
    update();
  };
  const focus = () => {
    focused = true;
    picker = false;
    update();
  };
  const system = () => {
    focused = document.hasFocus();
    update();
  };
  const file = (event: Event) => {
    if (
      event.type === 'click' &&
      event.target instanceof Element &&
      event.target.closest('a[download]')
    ) {
      picker = true;
      update();
      clearTimeout(downloadTimer);
      // Downloads may save directly or open a browser-owned destination picker.
      downloadTimer = setTimeout(() => {
        if (document.hasFocus()) {
          picker = false;
          update();
        }
      }, 1000);
      return;
    }
    if (
      !(event.target instanceof HTMLInputElement) ||
      event.target.type !== 'file'
    )
      return;
    picker = event.type === 'click';
    focused = document.hasFocus();
    update();
  };
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  window.addEventListener(changed, system);
  for (const name of ['click', 'change', 'cancel'])
    document.addEventListener(name, file, true);
  // An EPUB iframe can own focus when the OS deactivates the window, so the
  // parent window may not receive a second blur event. No book data is polled.
  const timer = setInterval(() => {
    const current = document.hasFocus();
    if (current !== focused) {
      if (current) focus();
      else blur();
    }
  }, 250);
  update();
  return () => {
    clearInterval(timer);
    clearTimeout(downloadTimer);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    window.removeEventListener(changed, system);
    for (const name of ['click', 'change', 'cancel'])
      document.removeEventListener(name, file, true);
  };
}
