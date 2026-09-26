import type { ReaderPreferences } from '../../domain/models';

export type ReadingAction =
  'prev' | 'next' | 'controls' | 'search' | 'settings' | 'bookmark';
export type TapAction = 'prev' | 'next' | 'controls' | 'none';
export const defaultTapZones = {
  left: 'prev',
  center: 'controls',
  right: 'next',
  sideWidth: 25,
} as const;
export const defaultShortcuts: Record<ReadingAction, string> = {
  prev: 'ArrowLeft',
  next: 'ArrowRight',
  controls: '',
  search: '',
  settings: '',
  bookmark: '',
};
export const actionLabels: Record<ReadingAction, string> = {
  prev: 'Previous page',
  next: 'Next page',
  controls: 'Toggle controls',
  search: 'Search',
  settings: 'Reading settings',
  bookmark: 'Toggle bookmark',
};
export const shortcutOptions = [
  { value: '', label: 'None' },
  ...[
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'PageUp',
    'PageDown',
  ].map((value) => ({
    value,
    label: value.replace(/([a-z])([A-Z])/g, '$1 $2'),
  })),
  { value: ' ', label: 'Space' },
  ...'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .map((value) => ({ value, label: value.toUpperCase() })),
];
const knownKeys = new Set(shortcutOptions.map(({ value }) => value));
const actions = Object.keys(defaultShortcuts) as ReadingAction[];
const tapActions: TapAction[] = ['prev', 'next', 'controls', 'none'];

export function resolvedTapZones(preferences: ReaderPreferences) {
  const saved = preferences.tapZones;
  const action = (zone: 'left' | 'center' | 'right') =>
    saved && tapActions.includes(saved[zone])
      ? saved[zone]
      : defaultTapZones[zone];
  return {
    left: action('left'),
    center: action('center'),
    right: action('right'),
    sideWidth:
      typeof saved?.sideWidth === 'number' && Number.isFinite(saved.sideWidth)
        ? Math.max(10, Math.min(45, saved.sideWidth))
        : 25,
  };
}

export function tapAction(
  x: number,
  width: number,
  rtl: boolean,
  preferences: ReaderPreferences,
): TapAction | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(width) ||
    width <= 0 ||
    x < 0 ||
    x > width
  )
    return null;
  const zones = resolvedTapZones(preferences);
  const edge = (width * zones.sideWidth) / 100;
  const action =
    x < edge ? zones.left : x > width - edge ? zones.right : zones.center;
  return rtl && (action === 'prev' || action === 'next')
    ? action === 'prev'
      ? 'next'
      : 'prev'
    : action;
}

export function resolvedShortcuts(
  preferences: ReaderPreferences,
): Record<ReadingAction, string> {
  return Object.fromEntries(
    actions.map((action) => {
      const saved = preferences.shortcuts?.[action];
      return [
        action,
        typeof saved === 'string' && knownKeys.has(saved)
          ? saved
          : defaultShortcuts[action],
      ];
    }),
  ) as Record<ReadingAction, string>;
}

/** Reassigning a used key disables its old action, including inherited defaults. */
export function assignShortcut(
  bindings: Record<ReadingAction, string>,
  action: ReadingAction,
  key: string,
) {
  const next = { ...bindings };
  if (key)
    for (const other of actions) if (next[other] === key) next[other] = '';
  next[action] = key;
  return next;
}

export function shortcutAction(
  event: KeyboardEvent,
  preferences: ReaderPreferences,
  rtl = false,
): ReadingAction | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return null;
  // nodeType works across the book iframe's separate window/HTMLElement realm.
  if (
    event
      .composedPath()
      .some(
        (node) =>
          'nodeType' in node &&
          node.nodeType === 1 &&
          (node as Element).closest(
            'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="combobox"]',
          ),
      )
  )
    return null;
  const bindings = resolvedShortcuts(preferences);
  const matches = actions.filter(
    (action) => bindings[action] && bindings[action] === event.key,
  );
  // Invalid imported duplicates should never dispatch an arbitrary action.
  if (matches.length !== 1) return null;
  const action = matches[0];
  if (event.repeat && action !== 'prev' && action !== 'next') return null;
  return rtl && (action === 'prev' || action === 'next')
    ? action === 'prev'
      ? 'next'
      : 'prev'
    : action;
}
