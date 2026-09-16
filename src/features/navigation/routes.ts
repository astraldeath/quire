import { useSyncExternalStore } from 'react';
export const hostedWeb = import.meta.env.VITE_HOSTED === 'true';
export type WebRoute = {
  kind:
    | 'library'
    | 'reading'
    | 'series'
    | 'series-tracking'
    | 'details'
    | 'tracking'
    | 'read'
    | 'settings'
    | 'admin'
    | 'account'
    | 'not-found';
  series?: string;
  bookId?: string;
  tab?: string;
};
export function parseWebRoute(path: string): WebRoute {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  try {
    if (parts.length === 0 || (parts.length === 1 && parts[0] === 'library'))
      return { kind: 'library' };
    if (parts.length === 1 && parts[0] === 'reading')
      return { kind: 'reading' };
    if (parts.length === 1 && parts[0] === 'account')
      return { kind: 'account' };
    if (
      parts[0] === 'series' &&
      parts[1] &&
      parts.length <= 3 &&
      (!parts[2] || parts[2] === 'tracking')
    )
      return {
        kind: parts[2] ? 'series-tracking' : 'series',
        series: decodeURIComponent(parts[1]),
      };
    if (
      parts[0] === 'books' &&
      /^[a-f0-9]{64}$/.test(parts[1] ?? '') &&
      parts.length <= 3 &&
      (!parts[2] || ['read', 'tracking'].includes(parts[2]))
    )
      return {
        kind:
          parts[2] === 'read'
            ? 'read'
            : parts[2] === 'tracking'
              ? 'tracking'
              : 'details',
        bookId: parts[1],
      };
    if (
      parts[0] === 'settings' &&
      parts.length <= 2 &&
      (!parts[1] ||
        ['appearance', 'library', 'backups', 'statistics', 'privacy'].includes(
          parts[1],
        ))
    )
      return { kind: 'settings', tab: parts[1] || 'appearance' };
    if (
      parts[0] === 'admin' &&
      parts.length <= 2 &&
      (!parts[1] ||
        [
          'overview',
          'libraries',
          'folders',
          'settings',
          'accounts',
          'invites',
          'backups',
        ].includes(parts[1]))
    )
      return { kind: 'admin', tab: parts[1] || 'overview' };
  } catch {
    /* malformed URL */
  }
  return { kind: 'not-found' };
}
const event = 'quire-navigation';
const snapshot = () => location.pathname + location.search;
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  window.addEventListener(event, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(event, listener);
  };
};
export function useWebPath() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function navigateWeb(path: string, replace = false) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('Expected a local Quire path.');
  const current = snapshot();
  if (current === path) return;
  const route = parseWebRoute(current);
  const shelf = ['library', 'reading', 'series'].includes(route.kind)
    ? current
    : history.state?.shelf || '/library';
  const state = replace ? history.state : { quire: true, from: current, shelf };
  history[replace ? 'replaceState' : 'pushState'](state, '', path);
  window.dispatchEvent(new Event(event));
}
export function closeWeb(fallback = '/library') {
  if (history.state?.quire && history.state?.from) {
    history.back();
    return;
  }
  navigateWeb(fallback, true);
}
export function shelfPath() {
  const path = history.state?.shelf;
  return typeof path === 'string' &&
    ['library', 'reading', 'series'].includes(parseWebRoute(path).kind)
    ? path
    : '/library';
}
