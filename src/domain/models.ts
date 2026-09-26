export interface Annotation {
  id: string;
  kind: 'bookmark' | 'highlight';
  cfi: string;
  text: string;
  note: string;
  section: string;
  createdAt: number;
  updatedAt: number;
}
export interface Position {
  currentChapter?: number;
  completedChapter?: number;
  cfi: string;
  fraction: number;
  section: string;
  updatedAt: number;
}
export interface Book {
  /** False for shared browsing until explicitly added to the personal library. */
  inLibrary?: boolean;
  format?:
    'epub' | 'cbz' | 'cbr' | 'cb7' | 'fb2' | 'fbz' | 'mobi' | 'azw3' | 'pdf';
  folder?: string;
  folders?: string[];
  id: string;
  title: string;
  author: string;
  series: string;
  volume: number | null;
  cover: string;
  addedAt: number;
  local: boolean;
  position?: Position;
  annotations?: Annotation[];
}
export interface ReaderPreferences {
  fontWeight?: number;
  linkColor?: string;
  tapZones?: {
    left: 'prev' | 'next' | 'controls' | 'none';
    center: 'prev' | 'next' | 'controls' | 'none';
    right: 'prev' | 'next' | 'controls' | 'none';
    sideWidth: number;
  };
  shortcuts?: Partial<
    Record<
      'prev' | 'next' | 'controls' | 'search' | 'settings' | 'bookmark',
      string
    >
  >;
  rsvpFocalColor?: string;
  rsvpGuides?: boolean;
  rsvpFont?: string;
  rsvpSize?: number;
  rsvpPunctuationMultiplier?: number;
  rsvpLongWordPauses?: boolean;
  rsvpLongWordMultiplier?: number;
  rsvpLongWordLength?: number;
  rsvpWpm?: number;
  rsvpPunctuationPauses?: boolean;
  theme: 'app' | 'light' | 'dark' | 'onyx' | 'contrast' | 'custom';
  foreground: string;
  background: string;
  font: string;
  size: number;
  lineHeight: number;
  margin: number;
  maxWidth: number;
  columns?: 'one' | 'two';
  flow: 'paginated' | 'scrolled' | 'continuous';
  tapToTurn?: boolean;
  swipeToTurn?: boolean;
  comicMode?: 'single' | 'double' | 'webtoon';
  comicDirection?: 'ltr' | 'rtl';
  animated?: boolean;
  publisherStyles: boolean;
}
export interface Preferences {
  bookReaderOverrides?: Record<string, Partial<ReaderPreferences>>;
  readingPresets?: ReadingPreset[];
  readingThemes?: ReadingTheme[];
  customFonts?: CustomFont[];
  lastBackupAt?: number;
  theme: 'system' | 'light' | 'dark' | 'onyx' | 'contrast' | 'custom';
  background: string;
  foreground: string;
  accent: string;
  view: 'grid' | 'list';
  sort: 'recent' | 'title' | 'author' | 'added' | 'last-read' | 'volume';
  sortDirection?: 'asc' | 'desc';
  groupSeries: boolean;
  flatLibrary?: boolean;
  coverSize: number;
  reader: ReaderPreferences;
}
export interface ReadingPreset {
  id: string;
  name: string;
  settings: ReaderPreferences;
}
export interface ReadingTheme {
  id: string;
  name: string;
  background: string;
  foreground: string;
  linkColor: string;
}
export interface CustomFont {
  id: string;
  name: string;
  data: string;
  format: 'truetype' | 'opentype';
}
export const defaults: Preferences = {
  theme: 'system',
  background: '#171819',
  foreground: '#e7e5df',
  accent: '#728EAE',
  view: 'grid',
  sort: 'recent',
  groupSeries: true,
  coverSize: 156,
  reader: {
    rsvpWpm: 250,
    rsvpPunctuationPauses: true,
    theme: 'app',
    foreground: '#e7e5df',
    background: '#171819',
    font: 'Georgia',
    size: 19,
    lineHeight: 1.7,
    margin: 36,
    maxWidth: 760,
    flow: 'paginated',
    tapToTurn: true,
    swipeToTurn: true,
    comicMode: 'single',
    comicDirection: 'ltr',
    animated: true,
    columns: 'one',
    publisherStyles: false,
  },
};
