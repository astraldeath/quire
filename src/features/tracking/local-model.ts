import type { Book } from '../../domain/models';

export type TrackingLink = {
  bookId: string;
  seriesId: number;
  seriesKey: string;
  title: string;
  volume: number;
  auto: boolean;
  completeEntry: boolean;
  lastStep: number;
  lastSync: number;
  error: string;
  nextAttempt: number;
  lastAttempt?: number;
};
export type LocalTracking = { accountId: string; links: TrackingLink[] };
export type SeriesMatch = {
  seriesKey: string;
  seriesId: number;
  title: string;
  auto: boolean;
};
export function newLink(
  value: Pick<
    TrackingLink,
    | 'bookId'
    | 'seriesId'
    | 'seriesKey'
    | 'title'
    | 'volume'
    | 'auto'
    | 'completeEntry'
  >,
): TrackingLink {
  if (
    !value.bookId ||
    !Number.isSafeInteger(value.seriesId) ||
    value.seriesId <= 0 ||
    !Number.isFinite(value.volume) ||
    value.volume < 0 ||
    value.volume > 10000
  )
    throw new Error('Choose a valid match and volume.');
  return {
    ...value,
    title: value.title.slice(0, 500),
    lastStep: 0,
    lastSync: 0,
    error: '',
    nextAttempt: 0,
  };
}
export function applySeries(
  links: TrackingLink[],
  books: Book[],
  match: SeriesMatch,
) {
  if (!match.seriesKey) throw new Error('Choose a series.');
  const result = [...links];
  for (const book of books.filter((b) => b.series === match.seriesKey)) {
    const index = result.findIndex((l) => l.bookId === book.id);
    if (index >= 0 && !result[index].seriesKey) continue;
    const next = newLink({
      ...match,
      bookId: book.id,
      volume: book.volume ?? 0,
      completeEntry: false,
    });
    if (index < 0) result.push(next);
    else result[index] = next;
  }
  return result;
}
export function progressPatch(
  link: TrackingLink,
  step: number,
  remote: { state: string; progress_volume: number },
): { state?: string; progress_volume?: number } {
  const patch: { state?: string; progress_volume?: number } = {};
  if (step === 1 && ['', 'considering', 'plan_to_read'].includes(remote.state))
    patch.state = 'reading';
  if (step === 2) {
    if (link.volume > remote.progress_volume)
      patch.progress_volume = link.volume;
    if (link.completeEntry && remote.state !== 'completed')
      patch.state = 'completed';
  }
  return patch;
}
export function searchPath(raw: string) {
  let query = raw.trim();
  if (!query || query.length > 300)
    throw new Error('Enter a title or MangaBaka link.');
  if (query.includes('://')) {
    const url = new URL(query);
    const match = url.pathname.match(
      /^\/(?:series\/|novel\/|manga\/|manhwa\/|manhua\/)?([1-9]\d{0,9})(?:\/[^/]*)?\/?$/,
    );
    if (
      url.origin !== 'https://mangabaka.org' ||
      url.username ||
      url.password ||
      url.search ||
      !match
    )
      throw new Error('Use a MangaBaka series link.');
    query = match[1];
  }
  return /^[1-9]\d{0,9}$/.test(query)
    ? `/v1/series/${query}`
    : '/v1/series/search?q=' + encodeURIComponent(query);
}

export function parseMatches(data: unknown) {
  const entries = Array.isArray(data) ? data : [data];
  return entries
    .filter(
      (v): v is Record<string, any> =>
        !!v &&
        typeof v === 'object' &&
        Number.isSafeInteger(v.id) &&
        v.id > 0 &&
        typeof v.title === 'string',
    )
    .slice(0, 10)
    .map((v) => {
      let cover = '';
      try {
        const url = new URL(v.cover?.x150?.x1);
        if (
          url.origin === 'https://cdn.mangabaka.dev' &&
          !url.username &&
          !url.password
        )
          cover = url.href;
      } catch {}
      return {
        id: v.id as number,
        title: v.title as string,
        author: Array.isArray(v.authors)
          ? v.authors.filter((a: unknown) => typeof a === 'string').join(', ')
          : '',
        type: typeof v.type === 'string' ? v.type : '',
        status: typeof v.status === 'string' ? v.status : '',
        description: typeof v.description === 'string' ? v.description : '',
        cover,
        sources:
          v.source && typeof v.source === 'object'
            ? Object.keys(v.source)
                .filter((k) => v.source[k] !== null)
                .sort()
                .map((k) => k.replaceAll('_', ' '))
            : [],
      };
    });
}
