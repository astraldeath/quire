import type { Book } from '../../domain/models';

export interface MatchCandidate {
  id: number;
  title: string;
  author: string;
  type: string;
  alternateTitles?: string[];
}

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function rankMatches<T extends MatchCandidate>(
  matches: T[],
  query: string,
  format?: Book['format'],
): T[] {
  const wanted = normalize(query);
  const score = (match: T) => {
    const titles = [
      match.title,
      ...(Array.isArray(match.alternateTitles)
        ? match.alternateTitles.filter((v) => typeof v === 'string')
        : []),
    ].map(normalize);
    const titleScore =
      wanted && titles.includes(wanted)
        ? 2
        : wanted &&
            titles.some(
              (t) => t.includes(wanted) || (wanted.includes(t) && !!t),
            )
          ? 1
          : 0;
    const type = (match.type || '').toLowerCase();
    const hint =
      format === 'epub'
        ? /novel/.test(type)
        : format === 'cbz' ||
            format === 'cbr' ||
            format === 'cb7' ||
            format === 'pdf'
          ? /manga|manhwa|manhua|comic/.test(type)
          : false;
    return titleScore * 10 + Number(hint);
  };
  return matches
    .map((match, index) => ({ match, index, score: score(match) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ match }) => match);
}
