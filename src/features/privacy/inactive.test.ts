import { afterEach, expect, it, vi } from 'vitest';
import { watchInactive, withSystemDialog } from './inactive';

afterEach(() => vi.restoreAllMocks());
it('detects leaving and returning while an EPUB iframe owns focus', () => {
  vi.useFakeTimers();
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const cover = vi.fn();
  const stop = watchInactive(cover);
  try {
    window.dispatchEvent(new Event('blur'));
    expect(cover).toHaveBeenLastCalledWith(false);
    focused.mockReturnValue(false);
    vi.advanceTimersByTime(250);
    expect(cover).toHaveBeenLastCalledWith(true);
    focused.mockReturnValue(true);
    vi.advanceTimersByTime(250);
    expect(cover).toHaveBeenLastCalledWith(false);
  } finally {
    stop();
    vi.useRealTimers();
  }
});
it('excludes browser download pickers without suppressing later focus loss', () => {
  vi.useFakeTimers();
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const cover = vi.fn();
  const stop = watchInactive(cover);
  const link = document.createElement('a');
  link.download = 'book.epub';
  document.body.append(link);
  try {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(1000);
    expect(cover).toHaveBeenLastCalledWith(false);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(cover).toHaveBeenLastCalledWith(true);
  } finally {
    stop();
    link.remove();
    vi.useRealTimers();
  }
});
it('covers on blur and clears on focus without changing library locks', () => {
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const cover = vi.fn();
  const stop = watchInactive(cover);
  window.dispatchEvent(new Event('blur'));
  expect(cover).toHaveBeenLastCalledWith(false);
  focused.mockReturnValue(false);
  window.dispatchEvent(new Event('blur'));
  expect(cover).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new Event('focus'));
  expect(cover).toHaveBeenLastCalledWith(false);
  stop();
  cover.mockClear();
  window.dispatchEvent(new Event('blur'));
  expect(cover).not.toHaveBeenCalled();
});
it('does not cover during a system dialog, but rechecks focus after it closes', async () => {
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const cover = vi.fn();
  const stop = watchInactive(cover);
  try {
    await withSystemDialog(async () => {
      focused.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      expect(cover).toHaveBeenLastCalledWith(false);
    });
    expect(cover).toHaveBeenLastCalledWith(true);
    window.dispatchEvent(new Event('focus'));
    expect(cover).toHaveBeenLastCalledWith(false);
  } finally {
    stop();
  }
});
it('excludes file pickers and resumes after cancellation', () => {
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const cover = vi.fn();
  const stop = watchInactive(cover);
  const input = document.createElement('input');
  input.type = 'file';
  document.body.append(input);
  try {
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(cover).toHaveBeenLastCalledWith(false);
    input.dispatchEvent(new Event('cancel', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(cover).toHaveBeenLastCalledWith(true);
  } finally {
    stop();
    input.remove();
  }
});
