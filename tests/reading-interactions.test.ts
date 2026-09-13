import { expect, it, vi } from 'vitest';
import { defaults } from '../src/domain/models';
import { boundaryTurn, installReadingInteractions, sideTurn } from '../src/features/reader/interactions';
import type { View } from 'foliate-js/view.js';

it('uses side zones, preserves the center, and reverses physical sides for RTL', () => {
  expect(sideTurn(20, 400)).toBe('prev');
  expect(sideTurn(380, 400)).toBe('next');
  expect(sideTurn(200, 400)).toBeNull();
  expect(sideTurn(20, 400, true)).toBe('next');
  expect(sideTurn(-10, 400)).toBeNull();
});
it('only crosses scroll boundaries in the requested direction', () => {
  expect(boundaryTurn(30, 500, 900, 1000)).toBeNull();
  expect(boundaryTurn(30, 600, 1000, 1000)).toBe('next');
  expect(boundaryTurn(-30, 0, 400, 1000)).toBe('prev');
  expect(boundaryTurn(0, 0, 400, 1000)).toBeNull();
});
it('continuous scrolling advances once at a boundary; chapter scroll does not', async () => {
  const target = document.createElement('div');
  const next = vi.fn().mockResolvedValue(undefined);
  const view = { renderer: { start: 600, end: 1000, viewSize: 1000, atEnd: false }, next } as unknown as View;
  let preferences = { ...defaults.reader, flow: 'scrolled' as typeof defaults.reader.flow };
  const dispose = installReadingInteractions(target, view, () => preferences);
  target.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
  expect(next).not.toHaveBeenCalled();
  preferences = { ...preferences, flow: 'continuous' };
  target.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
  target.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
  expect(next).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  dispose();
  target.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }));
  expect(next).toHaveBeenCalledTimes(1);
});
it('side clicks turn pages but links and disabled tap controls retain normal behavior', () => {
  const target = document.createElement('div'); document.body.append(target);
  const next = vi.fn().mockResolvedValue(undefined);
  const view = { renderer: target, next, getBoundingClientRect: () => ({ left: 0, width: 400 }) } as unknown as View;
  let preferences = { ...defaults.reader, tapToTurn: false };
  const dispose = installReadingInteractions(target, view, () => preferences);
  const click = (element: Element) => {
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 380 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 380, detail: 1 }));
  };
  click(target); expect(next).not.toHaveBeenCalled();
  preferences = { ...preferences, tapToTurn: true };
  const link = document.createElement('a'); link.href = '#chapter'; target.append(link);
  click(link); expect(next).not.toHaveBeenCalled();
  click(target); expect(next).toHaveBeenCalledTimes(1);
  dispose(); target.remove();
});
