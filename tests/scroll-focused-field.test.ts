import { afterEach, expect, it, vi } from 'vitest';
import { scrollFocusedField } from '../src/components/scrollFocusedField';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('scrolls the nested settings panel instead of its non-scrolling modal wrapper', () => {
  document.body.innerHTML =
    '<dialog open><div class="modal-body" style="overflow-y:hidden"><div class="settings-panels" style="overflow-y:auto"><label>Name<input /></label></div></div></dialog>';
  const dialog = document.querySelector('dialog')!;
  const panel = document.querySelector<HTMLElement>('.settings-panels')!;
  const field = document.querySelector('input')!;
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 300,
  } as DOMRect);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    top: 350,
    bottom: 390,
  } as DOMRect);
  field.focus();
  scrollFocusedField(dialog);
  expect(panel.scrollTop).toBe(102);
  expect(document.querySelector('.modal-body')!.scrollTop).toBe(0);
});

it('leaves visible fields and unrelated scroll containers in place', () => {
  document.body.innerHTML =
    '<div id="panel"><div style="overflow-y:auto"><input /></div></div>';
  const panel = document.querySelector<HTMLElement>('#panel')!;
  const body = panel.firstElementChild as HTMLElement;
  const field = document.querySelector('input')!;
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 300,
  } as DOMRect);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    top: 140,
    bottom: 180,
  } as DOMRect);
  field.focus();
  scrollFocusedField(panel);
  expect(body.scrollTop).toBe(0);
});
