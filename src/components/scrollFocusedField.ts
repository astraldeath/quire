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
      if (input.bottom > bounds.bottom - 12)
        body.scrollTop += input.bottom - bounds.bottom + 12;
      else if (input.top < bounds.top + 12)
        body.scrollTop -= bounds.top + 12 - input.top;
    }
    body = body.parentElement;
  }
}
