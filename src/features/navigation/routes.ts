import { useSyncExternalStore } from 'react';
import { hasNavigationBlockers, requestNavigation } from './blockers';
export const hostedWeb = import.meta.env.VITE_HOSTED === 'true';
export type WebRoute = {
  kind:
    | 'library'
    | 'reading'
    | 'series'
    | 'series-tracking'
    | 'details'
    | 'remove'
    | 'tracking'
    | 'read'
    | 'settings'
    | 'admin'
    | 'account'
    | 'catalogs'
    | 'not-found';
  series?: string;
  bookId?: string;
  tab?: string;
  library?: string;
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
    if (parts.length === 1 && parts[0] === 'catalogs')
      return { kind: 'catalogs' };
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
      (!parts[2] || ['read', 'remove', 'tracking'].includes(parts[2]))
    )
      return {
        kind:
          parts[2] === 'read'
            ? 'read'
            : parts[2] === 'remove'
              ? 'remove'
              : parts[2] === 'tracking'
                ? 'tracking'
                : 'details',
        bookId: parts[1],
      };
    if (
      parts[0] === 'settings' &&
      parts.length <= 2 &&
      (!parts[1] ||
        [
          'appearance',
          'library',
          'backups',
          'statistics',
          'privacy',
          'updates',
          'server',
        ].includes(parts[1]))
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
      return {
        kind: 'admin',
        tab: parts[1] || 'overview',
        ...(parts[1] === 'libraries' &&
        new URLSearchParams(path.split('?')[1]).get('library')
          ? { library: new URLSearchParams(path.split('?')[1]).get('library')! }
          : {}),
      };
  } catch {
    /* malformed URL */
  }
  return { kind: 'not-found' };
}
const event = 'quire-navigation';
const browserPath = () => location.pathname + location.search;
type Entry = {
  path: string;
  state: Record<string, unknown>;
  index: number;
  session: string;
};
let accepted: Entry | undefined;
let listening = false;
let restoring: { origin: Entry; target: Entry } | undefined;
let approved: Entry | undefined;
function indexedEntry(): Entry | undefined {
  const state = history.state;
  if (
    !state ||
    typeof state.quireSession !== 'string' ||
    !Number.isSafeInteger(state.quireIndex) ||
    state.quireIndex < 0
  )
    return;
  return {
    path: browserPath(),
    state,
    index: state.quireIndex,
    session: state.quireSession,
  };
}
function ownEntry(): Entry {
  const existing = indexedEntry();
  if (existing) return existing;
  const state = {
    ...(history.state && typeof history.state === 'object'
      ? history.state
      : {}),
    quireSession: crypto.randomUUID(),
    quireIndex: 0,
  };
  history.replaceState(state, '', browserPath());
  return indexedEntry()!;
}
function publish() {
  accepted = ownEntry();
  window.dispatchEvent(new Event(event));
}
function matches(a: Entry | undefined, b: Entry) {
  return a?.session === b.session && a.index === b.index && a.path === b.path;
}
function replaceUnknownSlot(path: string, state: unknown) {
  const data =
    state && typeof state === 'object'
      ? ({ ...state } as Record<string, unknown>)
      : {};
  // Neither the old index nor `from` describes this relocated entry. Start a
  // fresh segment rather than manufacture traversal directions for later pops.
  delete data.quireIndex;
  delete data.quireSession;
  delete data.quire;
  delete data.from;
  history.replaceState(data, '', path);
  accepted = ownEntry();
}
function guardUnknownSlot(origin: Entry, path: string, state: unknown) {
  replaceUnknownSlot(origin.path, origin.state);
  requestNavigation(() => {
    replaceUnknownSlot(path, state);
    publish();
  });
}
function resumeTraversal(origin: Entry, target: Entry) {
  // A later unknown pop can relocate the accepted URL while the first draft
  // confirmation remains open. Its relative offset is valid only at its
  // original entry. Otherwise accept that first destination in the new slot,
  // without arming an approval for a traversal that may never emit popstate.
  if (!matches(indexedEntry(), origin)) {
    replaceUnknownSlot(target.path, target.state);
    publish();
    return;
  }
  approved = target;
  history.go(target.index - origin.index);
}
function onPopState() {
  const target = indexedEntry();
  if (restoring) {
    const transition = restoring;
    if (!matches(target, transition.origin)) {
      // A second Back arrived before restoration completed. Return all the way
      // to the accepted entry and retain only the first pending destination.
      if (target?.session === transition.origin.session) {
        history.go(transition.origin.index - target.index);
        return;
      }
      restoring = undefined;
      guardUnknownSlot(
        transition.origin,
        transition.target.path,
        transition.target.state,
      );
      return;
    }
    restoring = undefined;
    requestNavigation(() =>
      resumeTraversal(transition.origin, transition.target),
    );
    return;
  }
  if (
    approved &&
    (matches(target, approved) ||
      (approved.index < 0 && browserPath() === approved.path))
  ) {
    approved = undefined;
    publish();
    return;
  }
  approved = undefined;
  if (!accepted || !hasNavigationBlockers()) {
    publish();
    return;
  }
  const origin = accepted;
  if (target?.session === origin.session && target.index !== origin.index) {
    restoring = { origin, target };
    history.go(origin.index - target.index);
    return;
  }
  // Legacy entries have no reliable traversal direction. Preserve the draft
  // and URL without pushing a duplicate entry. Accepting replaces this unknown
  // slot; we cannot reconstruct its original relationship to other entries.
  guardUnknownSlot(origin, browserPath(), history.state);
}
function ensureHistory() {
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    listening = true;
  }
  if (!restoring && !approved) accepted = ownEntry();
}
const snapshot = () => accepted?.path ?? browserPath();
const subscribe = (listener: () => void) => {
  ensureHistory();
  window.addEventListener(event, listener);
  return () => {
    window.removeEventListener(event, listener);
  };
};
export function useWebPath() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function navigateWeb(path: string, replace = false) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('Expected a local Quire path.');
  ensureHistory();
  if (snapshot() === path || restoring || approved) return;
  requestNavigation(() => {
    const current = accepted!.path;
    if (current === path) return;
    const route = parseWebRoute(current);
    const shelf = ['library', 'reading', 'series'].includes(route.kind)
      ? current
      : history.state?.shelf || '/library';
    const state = replace
      ? history.state
      : {
          quire: true,
          from: current,
          shelf,
          quireSession: accepted!.session,
          quireIndex: accepted!.index + 1,
        };
    history[replace ? 'replaceState' : 'pushState'](state, '', path);
    publish();
  });
}
export function closeWeb(fallback = '/library') {
  ensureHistory();
  if (restoring || approved) return;
  if (history.state?.quire && history.state?.from) {
    // Capture the destination before asking; a later legacy pop can replace
    // the current state (including `from`) while confirmation is still open.
    const origin = accepted!;
    const target = {
      ...origin,
      index: origin.index - 1,
      path: history.state.from,
      state: { shelf: origin.state.shelf },
    };
    requestNavigation(() => resumeTraversal(origin, target));
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
