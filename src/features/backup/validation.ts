import {
  defaults,
  type Annotation,
  type Book,
  type Preferences,
} from '../../domain/models';
const fail = (): never => {
  throw new Error('The backup contains invalid library data.');
};
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail();
const str = (v: unknown, max = 10000): string =>
  typeof v === 'string' && v.length <= max ? v : fail();
const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail();
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : fail());
const choice = <T extends string>(v: unknown, options: readonly T[]): T =>
  options.includes(v as T) ? (v as T) : fail();
export function validateBook(value: unknown): Book {
  const b = obj(value);
  const id = str(b.id, 64);
  if (!/^[a-f0-9]{64}$/.test(id)) fail();
  const cover = str(b.cover, 6 * 1024 * 1024);
  if (
    cover &&
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)
  )
    fail();
  const result: Book = {
    id,
    title: str(b.title),
    author: str(b.author),
    series: str(b.series),
    volume: b.volume === null ? null : num(b.volume),
    cover,
    addedAt: num(b.addedAt),
    local: false,
    ...(b.format !== undefined
      ? {
          format: choice(b.format, [
            'epub',
            'cbz',
            'fb2',
            'fbz',
            'mobi',
            'azw3',
          ] as const),
        }
      : {}),
    ...(b.folder !== undefined
      ? { folder: validFolder(b.folder) ? b.folder : fail() }
      : {}),
  };
  if (b.position !== undefined) {
    const p = obj(b.position);
    if (
      p.completedChapter !== undefined &&
      !Number.isInteger(p.completedChapter)
    )
      fail();
    result.position = {
      cfi: str(p.cfi),
      fraction: num(p.fraction, 0, 1),
      ...(p.completedChapter !== undefined
        ? { completedChapter: num(p.completedChapter, 0, 100000) }
        : {}),
      section: str(p.section),
      updatedAt: num(p.updatedAt),
    };
  }
  if (b.annotations !== undefined) {
    if (!Array.isArray(b.annotations) || b.annotations.length > 100000) fail();
    const ids = new Set<string>();
    result.annotations = (b.annotations as unknown[]).map((value) => {
      const a = obj(value);
      const id = str(a.id);
      if (!id || ids.has(id)) fail();
      ids.add(id);
      return {
        id,
        kind: choice(a.kind, ['bookmark', 'highlight']),
        cfi: str(a.cfi),
        text: str(a.text, 100000),
        note: str(a.note),
        section: str(a.section),
        createdAt: num(a.createdAt),
        updatedAt: num(a.updatedAt),
      } as Annotation;
    });
  }
  return result;
}
export function validatePreferences(value: unknown): Preferences {
  const p = obj(value),
    r = obj(p.reader);
  const color = (v: unknown) => {
    const s = str(v, 7);
    return /^#[a-f0-9]{6}$/i.test(s) ? s : fail();
  };
  return {
    theme: choice(p.theme, [
      'system',
      'light',
      'dark',
      'onyx',
      'contrast',
      'custom',
    ]),
    background: color(p.background),
    foreground: color(p.foreground),
    accent: color(p.accent),
    view: choice(p.view, ['grid', 'list']),
    sort: choice(p.sort, [
      'recent',
      'title',
      'author',
      'added',
      'last-read',
      'volume',
    ]),
    groupSeries: bool(p.groupSeries),
    coverSize: num(p.coverSize, 110, 210),
    reader: {
      theme: choice(r.theme, [
        'app',
        'light',
        'dark',
        'onyx',
        'contrast',
        'custom',
      ]),
      background: color(r.background),
      foreground: color(r.foreground),
      font: str(r.font, 200),
      size: num(r.size, 8, 100),
      lineHeight: num(r.lineHeight, 0.5, 5),
      margin: num(r.margin, 0, 200),
      maxWidth: num(r.maxWidth, 100, 3000),
      flow: choice(r.flow, ['paginated', 'scrolled', 'continuous']),
      publisherStyles: bool(r.publisherStyles),
      columns:
        r.columns === undefined
          ? defaults.reader.columns
          : choice(r.columns, ['one', 'two'] as const),
      tapToTurn: r.tapToTurn === undefined ? true : bool(r.tapToTurn),
      swipeToTurn: r.swipeToTurn === undefined ? true : bool(r.swipeToTurn),
      comicMode:
        r.comicMode === undefined
          ? 'single'
          : choice(r.comicMode, ['single', 'double', 'webtoon'] as const),
      comicDirection:
        r.comicDirection === undefined
          ? 'ltr'
          : choice(r.comicDirection, ['ltr', 'rtl'] as const),
      animated: r.animated === undefined ? true : bool(r.animated),
    },
  };
}
import { validFolder } from '../library/folders';
