/** Keep an edited field inside its real scroller, including nested settings panels. */
export function scrollFocusedField(panel: HTMLElement) {
  const field = panel.querySelector<HTMLElement>(
    'input:focus,textarea:focus,[contenteditable=true]:focus',
  );
  if (!field) return;
  let body = field.parentElement;
  while (body && body !== panel) {
    if (/(auto|scroll)/.test(getComputedStyle(body).overflowY)) {
      const bounds = body.getBoundingClientRect();
      const input = field.getBoundingClientRect();
      let bottom = bounds.bottom - 12;
      for (const actions of body.querySelectorAll<HTMLElement>(
        '.modal-footer, .tracker-entry-actions, .tracker-footer',
      )) {
        if (
          actions.contains(field) ||
          getComputedStyle(actions).position !== 'sticky'
        )
          continue;
        const footer = actions.getBoundingClientRect();
        if (
          footer.height > 0 &&
          footer.top > bounds.top &&
          footer.top < bounds.bottom
        )
          bottom = Math.min(bottom, footer.top - 12);
      }
      if (input.bottom > bottom) body.scrollTop += input.bottom - bottom;
      else if (input.top < bounds.top + 12)
        body.scrollTop -= bounds.top + 12 - input.top;
    }
    body = body.parentElement;
  }
}
