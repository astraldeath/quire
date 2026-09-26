import {
  defaults,
  type Annotation,
  type Book,
  type Preferences,
  type ReaderPreferences,
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
    ...(b.inLibrary === undefined ? {} : { inLibrary: bool(b.inLibrary) }),
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
            'cbr',
            'cb7',
            'fb2',
            'fbz',
            'mobi',
            'azw3',
            'pdf',
          ] as const),
        }
      : {}),
    ...(b.folders !== undefined
      ? validFolders(b.folders)
        ? { folders: [...b.folders], folder: b.folders[0] ?? '' }
        : fail()
      : b.folder !== undefined
        ? validFolder(b.folder)
          ? { folders: b.folder ? [b.folder] : [], folder: b.folder }
          : fail()
        : {}),
  };
  if (b.position !== undefined) {
    const p = obj(b.position);
    if (p.currentChapter !== undefined && !Number.isInteger(p.currentChapter))
      fail();
    if (
      p.completedChapter !== undefined &&
      !Number.isInteger(p.completedChapter)
    )
      fail();
    result.position = {
      cfi: str(p.cfi),
      fraction: num(p.fraction, 0, 1),
      ...(p.currentChapter !== undefined
        ? { currentChapter: num(p.currentChapter, 1, 100000) }
        : {}),
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
  const p = obj(value);
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
    ...(p.sortDirection === undefined
      ? {}
      : { sortDirection: choice(p.sortDirection, ['asc', 'desc'] as const) }),
    groupSeries: bool(p.groupSeries),
    flatLibrary: p.flatLibrary === undefined ? false : bool(p.flatLibrary),
    coverSize: num(p.coverSize, 110, 210),
    reader: validateReaderPreferences(p.reader),
    ...validateCustomization(p),
  };
}
import { validFolder, validFolders } from '../library/folders';

import {
  emptyFolderCatalog,
  validateFolderCatalog,
} from '../library/folderCatalog';
export const validateBackupFolders = (value: unknown) =>
  validateFolderCatalog(value === undefined ? emptyFolderCatalog() : value);

const color = (v: unknown) => {
  const s = str(v, 7);
  return /^#[a-f0-9]{6}$/i.test(s) ? s : fail();
};

export function validateReaderPreferences(value: unknown): ReaderPreferences {
  const r = obj(value);
  return {
    rsvpWpm: r.rsvpWpm === undefined ? 250 : num(r.rsvpWpm, 60, 1000),
    rsvpPunctuationPauses:
      r.rsvpPunctuationPauses === undefined
        ? true
        : bool(r.rsvpPunctuationPauses),
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
    ...validateReaderExtras(r),
  };
}

function validateReaderExtras(
  r: Record<string, unknown>,
): Partial<ReaderPreferences> {
  const out: Partial<ReaderPreferences> = {};
  for (const key of ['linkColor', 'rsvpFocalColor'] as const)
    if (r[key] !== undefined) out[key] = color(r[key]);
  for (const key of ['rsvpGuides', 'rsvpLongWordPauses'] as const)
    if (r[key] !== undefined) out[key] = bool(r[key]);
  for (const [key, min, max] of [
    ['fontWeight', 100, 900],
    ['rsvpSize', 24, 96],
    ['rsvpPunctuationMultiplier', 0, 3],
    ['rsvpLongWordMultiplier', 1, 3],
    ['rsvpLongWordLength', 4, 20],
  ] as const)
    if (r[key] !== undefined) out[key] = num(r[key], min, max);
  if (r.rsvpFont !== undefined) out.rsvpFont = str(r.rsvpFont, 200);
  if (r.tapZones !== undefined) {
    const zones = obj(r.tapZones);
    const actions = ['prev', 'next', 'controls', 'none'] as const;
    out.tapZones = {
      left: choice(zones.left, actions),
      center: choice(zones.center, actions),
      right: choice(zones.right, actions),
      sideWidth: num(zones.sideWidth, 10, 45),
    };
  }
  if (r.shortcuts !== undefined) {
    const bindings = obj(r.shortcuts);
    out.shortcuts = {};
    for (const key of [
      'prev',
      'next',
      'controls',
      'search',
      'settings',
      'bookmark',
    ] as const)
      if (bindings[key] !== undefined)
        out.shortcuts[key] = str(bindings[key], 50);
  }
  return out;
}

function validateCustomization(
  p: Record<string, unknown>,
): Partial<Preferences> {
  const out: Partial<Preferences> = {};
  const id = (value: unknown) => {
    const result = str(value, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail();
    return result;
  };
  const name = (value: unknown) => {
    const result = str(value, 100).trim();
    return result || fail();
  };
  const list = (value: unknown, max: number) => {
    if (!Array.isArray(value) || value.length > max) return fail();
    const ids = new Set<string>();
    return value.map((v) => {
      const item = obj(v);
      const key = id(item.id);
      if (ids.has(key)) fail();
      ids.add(key);
      return item;
    });
  };
  if (p.bookReaderOverrides !== undefined) {
    const records = obj(p.bookReaderOverrides);
    if (Object.keys(records).length > 10000) fail();
    out.bookReaderOverrides = {};
    for (const [bookId, value] of Object.entries(records)) {
      if (!/^[a-f0-9]{64}$/.test(bookId)) fail();
      const partial = obj(value);
      const valid = validateReaderPreferences({
        ...defaults.reader,
        ...partial,
      });
      const override: Partial<ReaderPreferences> = {};
      for (const key of Object.keys(partial) as (keyof ReaderPreferences)[])
        if (key in valid) Object.assign(override, { [key]: valid[key] });
      out.bookReaderOverrides[bookId] = override;
    }
  }
  if (p.readingPresets !== undefined)
    out.readingPresets = list(p.readingPresets, 100).map((item) => ({
      id: id(item.id),
      name: name(item.name),
      settings: validateReaderPreferences(item.settings),
    }));
  if (p.readingThemes !== undefined)
    out.readingThemes = list(p.readingThemes, 100).map((item) => ({
      id: id(item.id),
      name: name(item.name),
      foreground: color(item.foreground),
      background: color(item.background),
      linkColor: color(item.linkColor),
    }));
  if (p.customFonts !== undefined) {
    let size = 0;
    out.customFonts = list(p.customFonts, 20).map((item) => {
      const key = id(item.id);
      if (!/^quire-font-[a-f0-9]{64}$/.test(key)) fail();
      const data = str(item.data, Math.ceil((4 * 1024 * 1024) / 3) * 4);
      if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4)
        fail();
      size += data.length;
      if (size > 16 * 1024 * 1024) fail();
      return {
        id: key,
        name: name(item.name),
        data,
        format: choice(item.format, ['truetype', 'opentype'] as const),
      };
    });
  }
  return out;
}
