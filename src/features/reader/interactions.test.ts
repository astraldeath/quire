import { expect, it, vi } from 'vitest';
import type { View } from 'foliate-js/view.js';
import { defaults } from '../../domain/models';
import { installReadingInteractions } from './interactions';

it('routes custom tap actions while retaining link, selection, and tap-disable guards', () => {
  const host = document.createElement('div');
  host.innerHTML = '<a href="#">Link</a><p>Selected text</p>';
  document.body.append(host);
  const next = vi.fn().mockResolvedValue(undefined);
  const prev = vi.fn().mockResolvedValue(undefined);
  const controls = vi.fn();
  const view = {
    renderer: { localName: 'foliate-paginator' },
    isFixedLayout: false,
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    next,
    prev,
  } as unknown as View;
  let prefs = {
    ...defaults.reader,
    tapZones: {
      left: 'controls',
      center: 'next',
      right: 'none',
      sideWidth: 25,
    },
  } as typeof defaults.reader;
  const dispose = installReadingInteractions(
    host,
    view,
    () => prefs,
    undefined,
    controls,
  );
  const click = (x: number, target: Element = host) => {
    target.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: x, bubbles: true }),
    );
    target.dispatchEvent(
      new MouseEvent('click', { clientX: x, detail: 1, bubbles: true }),
    );
  };
  try {
    click(10);
    expect(controls).toHaveBeenCalledTimes(1);
    click(10, host.querySelector('a')!);
    expect(controls).toHaveBeenCalledTimes(1);
    const selection = document.getSelection()!;
    selection.selectAllChildren(host.querySelector('p')!);
    click(10);
    expect(controls).toHaveBeenCalledTimes(1);
    selection.removeAllRanges();
    prefs = { ...prefs, tapToTurn: false };
    click(50);
    expect(next).not.toHaveBeenCalled();
    click(90);
    expect(next).not.toHaveBeenCalled();
    prefs = { ...prefs, tapToTurn: true };
    click(50);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).not.toHaveBeenCalled();
  } finally {
    dispose();
    host.remove();
  }
});
