import { expect, it } from 'vitest';
import { dialogPosition } from '../src/components/dialogPosition';
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
