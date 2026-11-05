import { afterEach, expect, it, vi } from 'vitest';
import {
  getLayoutViewport,
  installViewport,
  isKeyboardVisible,
} from '../src/viewport';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function setup(coarse = true, width = 390, height = 844) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
  const visual = Object.assign(new EventTarget(), { width, height });
  vi.stubGlobal('visualViewport', visual);
  dispose = installViewport();
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  return {
    input,
    resize(nextWidth: number, inner: number, visible = inner) {
      vi.stubGlobal('innerWidth', nextWidth);
      vi.stubGlobal('innerHeight', inner);
      visual.width = nextWidth;
      visual.height = visible;
      window.dispatchEvent(new Event('resize'));
      visual.dispatchEvent(new Event('resize'));
    },
  };
}

it('preserves the layout through native resize, blur, and a dialog transition until keyboard recovery', () => {
  const { input, resize } = setup();
  resize(390, 810);
  expect(getLayoutViewport()?.height).toBe(844);
  resize(390, 410);
  expect(isKeyboardVisible()).toBe(true);
  expect(getLayoutViewport()).toEqual({ width: 390, height: 844 });
  expect(document.documentElement.style.getPropertyValue('--app-height')).toBe(
    '844px',
  );
  expect(
    document.documentElement.style.getPropertyValue('--visual-height'),
  ).toBe('410px');
  input.blur();
  const dialog = document.createElement('dialog');
  document.body.append(dialog);
  resize(390, 420);
  expect(isKeyboardVisible()).toBe(true);
  expect(getLayoutViewport()?.height).toBe(844);
  resize(390, 800);
  expect(getLayoutViewport()?.height).toBe(844);
  resize(390, 844);
  expect(isKeyboardVisible()).toBe(false);
  expect(getLayoutViewport()?.height).toBe(844);
});

it('detects visual viewport occlusion even when the native layout viewport stays tall', () => {
  const { resize } = setup();
  resize(390, 844, 410);
  expect(isKeyboardVisible()).toBe(true);
  expect(getLayoutViewport()?.height).toBe(844);
  expect(
    document.documentElement.style.getPropertyValue('--visual-height'),
  ).toBe('410px');
});

it('accepts orientation changes while a keyboard session is active', () => {
  const { resize } = setup();
  resize(390, 410);
  resize(844, 390);
  expect(getLayoutViewport()).toEqual({ width: 844, height: 390 });
  expect(isKeyboardVisible()).toBe(false);
});

it('accepts desktop window resizing with an input focused', () => {
  const { resize } = setup(false, 1440, 1000);
  resize(1440, 600);
  expect(getLayoutViewport()).toEqual({ width: 1440, height: 600 });
  expect(isKeyboardVisible()).toBe(false);
});

it('accepts mobile size changes without editing instead of freezing browser chrome or window changes', () => {
  const { input, resize } = setup();
  input.blur();
  resize(390, 740);
  expect(getLayoutViewport()?.height).toBe(740);
  expect(isKeyboardVisible()).toBe(false);
});
