import { describe, it, expect, vi } from 'vitest';
import {
  registerNavigationBlocker,
  requestNavigation,
} from '../src/features/navigation/blockers';
import {
  parseWebRoute,
  navigateWeb,
  closeWeb,
} from '../src/features/navigation/routes';
describe('WebUI navigation', () => {
  it('recognizes encoded series, reader, and nested routes', () => {
    expect(parseWebRoute('/settings/server')).toEqual({
      kind: 'settings',
      tab: 'server',
    });
    expect(parseWebRoute('/settings/statistics')).toEqual({
      kind: 'settings',
      tab: 'statistics',
    });
    expect(parseWebRoute('/series/A%2FB%20%26%20C/tracking')).toMatchObject({
      kind: 'series-tracking',
      series: 'A/B & C',
    });
    expect(parseWebRoute('/books/' + 'a'.repeat(64) + '/read')).toMatchObject({
      kind: 'read',
      bookId: 'a'.repeat(64),
    });
    expect(parseWebRoute('/settings/backups')).toMatchObject({
      kind: 'settings',
      tab: 'backups',
    });
    expect(parseWebRoute('/admin/folders')).toMatchObject({
      kind: 'admin',
      tab: 'folders',
    });
    expect(parseWebRoute('/series/%E0%A4%A')).toMatchObject({
      kind: 'not-found',
    });
  });
  it('preserves the shelf while opening nested destinations and rejects external URLs', () => {
    history.replaceState(null, '', '/series/Novels');
    navigateWeb('/books/' + 'b'.repeat(64));
    expect(history.state.shelf).toBe('/series/Novels');
    navigateWeb('/settings/appearance');
    navigateWeb('/settings/backups', true);
    expect(history.state.from).toBe('/books/' + 'b'.repeat(64));
    expect(() => navigateWeb('https://evil.example')).toThrow();
    history.replaceState(null, '', '/settings/backups');
    closeWeb('/library');
    expect(location.pathname).toBe('/library');
  });
});

describe('guarded browser history', () => {
  it('asks each active draft only once even when their confirmations are asynchronous', async () => {
    let firstResume: (() => void) | undefined,
      secondResume: (() => void) | undefined;
    const first = vi.fn((resume: () => void) => {
      firstResume = resume;
    });
    const second = vi.fn((resume: () => void) => {
      secondResume = resume;
    });
    const removeFirst = registerNavigationBlocker(first),
      removeSecond = registerNavigationBlocker(second);
    let completed = 0;
    try {
      requestNavigation(() =>
        requestNavigation(() => {
          completed++;
        }),
      );
      expect(second).toHaveBeenCalledOnce();
      secondResume!();
      expect(first).toHaveBeenCalledOnce();
      firstResume!();
      expect(completed).toBe(1);
      expect(second).toHaveBeenCalledOnce();
      expect(first).toHaveBeenCalledOnce();
    } finally {
      removeFirst();
      removeSecond();
    }
  });
  it('does not prompt twice when closing a legacy entry', async () => {
    history.replaceState(null, '', '/reading');
    history.pushState(
      { quire: true, from: '/reading' },
      '',
      '/settings/appearance',
    );
    // Initialize the current legacy entry without changing its destination.
    navigateWeb('/settings/appearance');
    let resume: (() => void) | undefined;
    const blocked = vi.fn((action: () => void) => {
      resume = action;
    });
    const remove = registerNavigationBlocker(blocked);
    try {
      closeWeb();
      expect(blocked).toHaveBeenCalledOnce();
      resume!();
      await vi.waitFor(() => expect(location.pathname).toBe('/reading'));
      expect(blocked).toHaveBeenCalledOnce();
    } finally {
      remove();
    }
  });
  it('restores cancelled Back/Forward without adding entries or publishing rejected routes', async () => {
    history.replaceState(null, '', '/library');
    navigateWeb('/settings/appearance');
    navigateWeb('/settings/backups');
    const length = history.length;
    const published: string[] = [];
    const listener = () => published.push(location.pathname);
    window.addEventListener('quire-navigation', listener);
    let resume: (() => void) | undefined;
    const blocked = vi.fn((action: () => void) => {
      resume = action;
    });
    const unregister = registerNavigationBlocker(blocked);
    try {
      history.back();
      await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
      expect(location.pathname).toBe('/settings/backups');
      expect(published).toEqual([]);
      expect(history.length).toBe(length);
      // Drop the first request (Keep editing), then retry Back and accept.
      history.back();
      await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(2));
      resume!();
      await vi.waitFor(() =>
        expect(location.pathname).toBe('/settings/appearance'),
      );
      expect(published).toEqual(['/settings/appearance']);
      resume!(); // stale callbacks cannot navigate twice
      expect(history.length).toBe(length);
      history.forward();
      await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(3));
      expect(location.pathname).toBe('/settings/appearance');
      resume!();
      await vi.waitFor(() =>
        expect(location.pathname).toBe('/settings/backups'),
      );
      expect(published).toEqual(['/settings/appearance', '/settings/backups']);
      expect(history.length).toBe(length);
    } finally {
      unregister();
      window.removeEventListener('quire-navigation', listener);
    }
  });
  it('guards app push, replace, and close without mutating history before approval', async () => {
    history.replaceState(null, '', '/library');
    navigateWeb('/settings/appearance');
    let resume: (() => void) | undefined;
    const unregister = registerNavigationBlocker((action) => {
      resume = action;
    });
    try {
      const length = history.length;
      navigateWeb('/settings/backups');
      expect(location.pathname).toBe('/settings/appearance');
      expect(history.length).toBe(length);
      resume!();
      expect(location.pathname).toBe('/settings/backups');
      navigateWeb('/settings/privacy', true);
      expect(location.pathname).toBe('/settings/backups');
      resume!();
      expect(location.pathname).toBe('/settings/privacy');
      closeWeb();
      await vi.waitFor(() =>
        expect(location.pathname).toBe('/settings/privacy'),
      );
      await vi.waitFor(() => expect(resume).toBeDefined());
      // Wait for browser restoration and its distinct request.
      await new Promise((resolve) => setTimeout(resolve, 30));
      resume!();
      await vi.waitFor(() =>
        expect(location.pathname).toBe('/settings/appearance'),
      );
    } finally {
      unregister();
    }
  });
  it('conservatively restores unknown legacy state without adding entries', async () => {
    history.replaceState({ legacy: true }, '', '/reading');
    // An old entry has no usable direction/index, as after an app upgrade.
    history.pushState(null, '', '/library');
    navigateWeb('/settings/appearance', true);
    const length = history.length;
    const originalSession = history.state.quireSession;
    let resume: (() => void) | undefined;
    const unregister = registerNavigationBlocker((action) => {
      resume = action;
    });
    try {
      history.back();
      await vi.waitFor(() => expect(resume).toBeDefined());
      expect(location.pathname).toBe('/settings/appearance');
      expect(history.length).toBe(length);
      // The unknown slot cannot reuse the accepted entry's index: that would
      // falsely imply a known direction for subsequent Back/Forward attempts.
      expect(history.state.quireSession).not.toBe(originalSession);
      resume!();
      resume!();
      expect(location.pathname).toBe('/reading');
      expect(history.length).toBe(length);
    } finally {
      unregister();
    }
  });
});
