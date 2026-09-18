import { expect, it, vi } from 'vitest';
import { defaults } from '../src/domain/models';
import {
  boundaryTurn,
  installReadingInteractions,
  sideTurn,
} from '../src/features/reader/interactions';
import type { View } from 'foliate-js/view.js';

it('turns comic pages by swipe without paginator scrolling methods', () => {
  const target = document.createElement('div');
  const next = vi.fn().mockResolvedValue(undefined);
  const dispose = installReadingInteractions(
    target,
    {
      renderer: { localName: 'foliate-fxl' },
      next,
      getBoundingClientRect: () => ({ left: 0, width: 400 }),
    } as unknown as View,
    () => ({ ...defaults.reader, flow: 'scrolled' }),
  );
  target.dispatchEvent(touchEvent('touchstart', 350, 100));
  target.dispatchEvent(touchEvent('touchmove', 100, 100));
  target.dispatchEvent(touchEvent('touchend', 100, 100));
  expect(next).toHaveBeenCalledOnce();
  dispose();
});

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
  const view = {
    renderer: { start: 600, end: 1000, viewSize: 1000, atEnd: false },
    next,
  } as unknown as View;
  let preferences = {
    ...defaults.reader,
    flow: 'scrolled' as typeof defaults.reader.flow,
  };
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
  const target = document.createElement('div');
  document.body.append(target);
  const next = vi.fn().mockResolvedValue(undefined);
  const view = {
    renderer: target,
    next,
    getBoundingClientRect: () => ({ left: 0, width: 400 }),
  } as unknown as View;
  let preferences = { ...defaults.reader, tapToTurn: false };
  const dispose = installReadingInteractions(target, view, () => preferences);
  const click = (element: Element) => {
    element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 380 }),
    );
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: 380, detail: 1 }),
    );
  };
  click(target);
  expect(next).not.toHaveBeenCalled();
  preferences = { ...preferences, tapToTurn: true };
  const link = document.createElement('a');
  link.href = '#chapter';
  target.append(link);
  click(link);
  expect(next).not.toHaveBeenCalled();
  click(target);
  expect(next).toHaveBeenCalledTimes(1);
  dispose();
  target.remove();
});

function touchEvent(type: string, x: number, y: number) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
  });
}
it('turns on a touch-only tap without pointer or synthetic click events', () => {
  const target = document.createElement('div');
  const next = vi.fn().mockResolvedValue(undefined);
  const view = {
    renderer: target,
    next,
    getBoundingClientRect: () => ({ left: 0, width: 400 }),
  } as unknown as View;
  const dispose = installReadingInteractions(
    target,
    view,
    () => defaults.reader,
  );
  target.dispatchEvent(touchEvent('touchstart', 380, 100));
  target.dispatchEvent(touchEvent('touchend', 380, 100));
  expect(next).toHaveBeenCalledTimes(1);
  dispose();
});
it('drags the actual page before release, then snaps without a duplicate turn', () => {
  const target = document.createElement('div');
  const next = vi.fn();
  const scrollBy = vi.fn();
  const settle = vi.fn();
  const view = {
    renderer: { containerPosition: 400, scrollBy, snap: settle },
    next,
  } as unknown as View;
  const dispose = installReadingInteractions(
    target,
    view,
    () => defaults.reader,
  );
  const upstream = vi.fn();
  target.addEventListener('touchend', upstream);
  target.dispatchEvent(touchEvent('touchstart', 300, 100));
  target.dispatchEvent(touchEvent('touchmove', 180, 105));
  expect(scrollBy).toHaveBeenCalledWith(120, 0);
  expect(settle).not.toHaveBeenCalled();
  target.dispatchEvent(touchEvent('touchend', 100, 105));
  expect(settle).toHaveBeenCalledTimes(1);
  expect(next).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
  dispose();
});
it('center taps reveal controls even with paging disabled or in scroll mode', () => {
  const target = document.createElement('div');
  const reveal = vi.fn();
  const view = {
    renderer: target,
    getBoundingClientRect: () => ({ left: 0, width: 400 }),
  } as unknown as View;
  const dispose = installReadingInteractions(
    target,
    view,
    () => ({ ...defaults.reader, flow: 'scrolled', tapToTurn: false }),
    () => {},
    reveal,
  );
  target.dispatchEvent(touchEvent('touchstart', 200, 100));
  target.dispatchEvent(touchEvent('touchend', 200, 100));
  expect(reveal).toHaveBeenCalledTimes(1);
  dispose();
});
it('a cancelled drag restores its starting offset', () => {
  const target = document.createElement('div');
  const renderer = { containerPosition: 400, scrollBy: vi.fn(), snap: vi.fn() };
  const dispose = installReadingInteractions(
    target,
    { renderer } as unknown as View,
    () => defaults.reader,
  );
  target.dispatchEvent(touchEvent('touchstart', 300, 100));
  target.dispatchEvent(touchEvent('touchmove', 220, 100));
  renderer.containerPosition = 480;
  target.dispatchEvent(touchEvent('touchcancel', 220, 100));
  expect(renderer.containerPosition).toBe(400);
  expect(renderer.snap).toHaveBeenCalledWith(0, 0);
  dispose();
});
it('leaves chapter scrolling to the native scroller for momentum', () => {
  const target = document.createElement('div');
  const renderer = { start: 0, end: 400, viewSize: 1000, containerPosition: 0 };
  const view = { renderer } as unknown as View;
  const dispose = installReadingInteractions(target, view, () => ({
    ...defaults.reader,
    flow: 'scrolled',
  }));
  target.dispatchEvent(touchEvent('touchstart', 100, 300));
  const move = touchEvent('touchmove', 100, 230);
  target.dispatchEvent(move);
  expect(move.defaultPrevented).toBe(false);
  expect(renderer.containerPosition).toBe(0);
  dispose();
});

it('allows link drags but preserves link taps and suppresses clicks after a drag', () => {
  const target = document.createElement('div');
  const link = document.createElement('a');
  link.href = '#chapter';
  target.append(link);
  const renderer = { containerPosition: 0, scrollBy: vi.fn(), snap: vi.fn() };
  const next = vi.fn();
  const center = vi.fn();
  const dispose = installReadingInteractions(
    target,
    {
      renderer,
      next,
      getBoundingClientRect: () => ({ left: 0, width: 400 }),
    } as unknown as View,
    () => defaults.reader,
    () => {},
    center,
  );
  link.dispatchEvent(touchEvent('touchstart', 380, 100));
  const end = touchEvent('touchend', 380, 100);
  link.dispatchEvent(end);
  expect(end.defaultPrevented).toBe(false);
  expect(next).not.toHaveBeenCalled();
  expect(center).not.toHaveBeenCalled();
  link.dispatchEvent(touchEvent('touchstart', 380, 100));
  link.dispatchEvent(touchEvent('touchmove', 200, 100));
  link.dispatchEvent(touchEvent('touchend', 200, 100));
  expect(renderer.scrollBy).toHaveBeenCalledWith(180, 0);
  expect(renderer.snap).toHaveBeenCalledTimes(1);
  const activate = vi.fn();
  link.addEventListener('click', activate);
  const click = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(activate).not.toHaveBeenCalled();
  dispose();
});

it('keeps native scrolling while crossing a continuous chapter boundary', () => {
  const target = document.createElement('div');
  const next = vi.fn().mockResolvedValue(undefined);
  const renderer = {
    start: 600,
    end: 1000,
    viewSize: 1000,
    containerPosition: 600,
    atEnd: false,
  };
  const dispose = installReadingInteractions(
    target,
    { renderer, next } as unknown as View,
    () => ({ ...defaults.reader, flow: 'continuous' }),
  );
  target.dispatchEvent(touchEvent('touchstart', 100, 300));
  const move = touchEvent('touchmove', 100, 230);
  target.dispatchEvent(move);
  expect(move.defaultPrevented).toBe(false);
  expect(renderer.containerPosition).toBe(600);
  expect(next).toHaveBeenCalledTimes(1);
  dispose();
});
