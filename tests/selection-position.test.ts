import { expect, it } from 'vitest';
import {
  selectionPosition,
  visibleSelectionBox,
} from '../src/features/reader/selectionPosition';
const viewport = { top: 59, left: 0, width: 390, height: 700 };
const bar = { width: 300, height: 56 };
it('places the toolbar above text with a gap for selection handles', () => {
  const p = selectionPosition(
    { left: 80, right: 280, top: 400, bottom: 460 },
    bar,
    viewport,
  );
  expect(p.top + bar.height).toBeLessThanOrEqual(380);
  expect(p.left).toBeGreaterThanOrEqual(10);
});
it('flips below text at the top of the reading viewport', () => {
  const p = selectionPosition(
    { left: 0, right: 380, top: 65, bottom: 100 },
    bar,
    viewport,
  );
  expect(p.top).toBeGreaterThanOrEqual(120);
  expect(p.left + bar.width).toBeLessThanOrEqual(380);
});
it('stays above the keyboard when the selection is near the bottom', () => {
  const p = selectionPosition(
    { left: 300, right: 380, top: 360, bottom: 390 },
    bar,
    { ...viewport, height: 350 },
  );
  expect(p.top + bar.height).toBeLessThan(360);
  expect(p.left + bar.width).toBeLessThanOrEqual(380);
});
it('maps and clips a paginated iframe range into the app viewport', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  const range = doc.createRange();
  Object.defineProperty(iframe, 'getBoundingClientRect', {
    value: () => ({ left: -400, right: 800, top: 100, bottom: 700 }),
  });
  Object.defineProperty(range, 'getClientRects', {
    value: () => [
      { left: 410, right: 650, top: 100, bottom: 130 },
      { left: 810, right: 1050, top: 100, bottom: 130 },
    ],
  });
  expect(visibleSelectionBox(range, doc, viewport)).toEqual({
    left: 10,
    right: 250,
    top: 200,
    bottom: 230,
  });
  iframe.remove();
});
