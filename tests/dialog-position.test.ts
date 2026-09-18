import { expect, it, vi } from 'vitest';
import { dialogPosition, safeInsets } from '../src/components/dialogPosition';
it('reserves custom window controls while leaving fullscreen and mobile insets unchanged', () => {
  const bar = document.createElement('header');
  bar.className = 'desktop-titlebar';
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
    bottom: 65,
  } as DOMRect);
  document.body.append(bar);
  try {
    expect(safeInsets().top).toBe(65);
    bar.hidden = true;
    expect(safeInsets().top).toBe(0);
  } finally {
    bar.remove();
    vi.restoreAllMocks();
  }
});
it('keeps the dialog below the status bar and anchored when the keyboard opens', () => {
  const screen = { top: 0, left: 0, width: 390, height: 844 };
  const safe = { top: 59, bottom: 34 };
  const normal = dialogPosition(screen, 680, safe);
  const keyboard = dialogPosition(
    { ...screen, height: 410 },
    680,
    { top: 59, bottom: 0 },
    normal.anchor,
  );
  expect(keyboard.top).toBe(normal.top);
  expect(keyboard.top).toBeGreaterThanOrEqual(71);
  expect(keyboard.top + keyboard.maxHeight).toBe(398);
});
it('handles iOS visual viewport panning without covering the safe area', () => {
  const position = dialogPosition(
    { top: 74, left: 0, width: 390, height: 410 },
    680,
    { top: 59, bottom: 0 },
    82,
  );
  expect(position.top).toBe(156);
  expect(position.maxHeight).toBe(316);
});
it('keeps short dialogs centered without a keyboard and clamps a tiny viewport', () => {
  expect(
    dialogPosition({ top: 0, left: 0, width: 500, height: 800 }, 200, {
      top: 0,
      bottom: 0,
    }).top,
  ).toBe(300);
  const tiny = dialogPosition(
    { top: 0, left: 0, width: 390, height: 180 },
    680,
    { top: 59, bottom: 0 },
    200,
  );
  expect(tiny.top).toBe(71);
  expect(tiny.maxHeight).toBe(97);
});
it('moves a short dialog up enough to keep its form usable above the keyboard', () => {
  const safe = { top: 59, bottom: 0 };
  const position = dialogPosition(
    { top: 0, left: 0, width: 390, height: 410 },
    400,
    safe,
    290,
  );
  expect(position.maxHeight).toBeGreaterThanOrEqual(240);
  expect(position.top).toBeGreaterThanOrEqual(71);
  expect(position.top + position.maxHeight).toBeLessThanOrEqual(398);
});
