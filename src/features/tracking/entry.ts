export const readingStates = {
  plan_to_read: 'Plan to read',
  reading: 'Reading',
  completed: 'Completed',
  paused: 'On hold',
  dropped: 'Dropped',
  rereading: 'Rereading',
  considering: 'Considering',
} as const;
export interface TrackerEntry {
  state: keyof typeof readingStates;
  progress_chapter: number | null;
  progress_volume: number | null;
  rating: number | null;
  start_date: string | null;
  finish_date: string | null;
  is_private: boolean;
}
export const emptyEntry = (): TrackerEntry => ({
  state: 'plan_to_read',
  progress_chapter: null,
  progress_volume: null,
  rating: null,
  start_date: null,
  finish_date: null,
  is_private: true,
});
export function parseEntry(raw: unknown): TrackerEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('MangaBaka returned an invalid entry.');
  const v = raw as Record<string, unknown>;
  const state = v.state ?? 'plan_to_read';
  if (typeof state !== 'string' || !Object.hasOwn(readingStates, state))
    throw new Error('Invalid reading status.');
  const number = (key: string, max: number) => {
    const n = v[key];
    if (n === null || n === undefined) return null;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max)
      throw new Error(`Invalid ${key.replaceAll('_', ' ')}.`);
    return n || null;
  };
  const date = (key: string) => {
    const value = v[key];
    if (value == null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))
      throw new Error('Invalid reading date.');
    const day = value.slice(0, 10),
      time = Date.parse(day + 'T00:00:00Z');
    if (
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== day ||
      day < '1679-01-01' ||
      day > '2262-12-31'
    )
      throw new Error('Invalid reading date.');
    return day;
  };
  if (typeof v.is_private !== 'boolean')
    throw new Error('Invalid tracking privacy.');
  return {
    state: state as TrackerEntry['state'],
    progress_chapter: number('progress_chapter', 10000),
    progress_volume: number('progress_volume', 10000),
    rating: number('rating', 100),
    start_date: date('start_date'),
    finish_date: date('finish_date'),
    is_private: v.is_private,
  };
}
export function entryPatch(
  before: TrackerEntry,
  after: TrackerEntry,
): Partial<TrackerEntry> {
  const valid = parseEntry(after);
  return Object.fromEntries(
    Object.entries(valid).filter(
      ([key, value]) => value !== before[key as keyof TrackerEntry],
    ),
  );
}
export function validateEntryPatch(raw: unknown): Partial<TrackerEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid tracker changes.');
  const keys = Object.keys(raw);
  if (!keys.length || keys.some((k) => !Object.hasOwn(emptyEntry(), k)))
    throw new Error('Invalid tracker changes.');
  if (
    'state' in raw &&
    (typeof raw.state !== 'string' || !Object.hasOwn(readingStates, raw.state))
  )
    throw new Error('Invalid reading status.');
  const normalized = parseEntry({ ...emptyEntry(), ...raw });
  return Object.fromEntries(
    keys.map((k) => [k, normalized[k as keyof TrackerEntry]]),
  );
}
