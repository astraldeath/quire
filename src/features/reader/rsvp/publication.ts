import type { ReaderBook } from '../../../books';
import {
  tokenizeRsvp,
  tokenAtRange,
  tokenRange,
  type RsvpToken,
} from './tokens';
export interface RsvpSection {
  index: number;
  tokens: RsvpToken[];
  tokenIndex: number;
}
export interface RsvpLocator {
  getCFI(index: number, range?: Range): string;
  resolveNavigation(cfi: string): unknown;
}
export function supportsRsvp(book: ReaderBook, format = 'epub'): boolean {
  return (
    !['cbz', 'cbr', 'cb7', 'pdf'].includes(format) &&
    !book.comicPages &&
    book.rendition?.layout !== 'pre-paginated' &&
    !!book.sections?.some((s) => s.createDocument)
  );
}
/** Detached sanitized documents need no resource URLs or renderer load references.
 * Only the current document and one next section are retained. */
export class RsvpPublication {
  private closed = false;
  private documents = new Map<number, Promise<Document>>();
  private styles = new WeakMap<Document, string[]>();
  constructor(
    private book: ReaderBook,
    private locator: RsvpLocator,
    private locale?: string,
  ) {}
  private async document(index: number): Promise<Document> {
    if (this.closed) throw new Error('RSVP is closed.');
    let pending = this.documents.get(index);
    if (!pending) {
      const create = this.book.sections?.[index]?.createDocument;
      if (!create)
        throw new Error('This section has no readable text document.');
      pending = Promise.resolve(create.call(this.book.sections![index])).then(
        async (doc) => {
          this.styles.set(doc, await this.publisherStyles(index, doc));
          return doc;
        },
      );
      this.documents.set(index, pending);
    }
    const doc = await pending;
    if (this.closed) throw new Error('RSVP is closed.');
    return doc;
  }
  private async publisherStyles(
    index: number,
    doc: Document,
  ): Promise<string[]> {
    const book = this.book as ReaderBook & {
      loadText?(href: string): Promise<string | null>;
    };
    const section = this.book.sections![index] as {
      resolveHref?(href: string): string;
    };
    if (!book.loadText || !section.resolveHref) return [];
    const result: string[] = [];
    const visited = new Set<string>();
    let bytes = 0;
    const read = async (href: string) => {
      if (
        this.closed ||
        visited.has(href) ||
        visited.size >= 16 ||
        bytes >= 2 * 1024 * 1024 ||
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)
      )
        return;
      visited.add(href);
      // This is the archive's local-file reader, never fetch or a browser URL.
      const css = await book.loadText!(href);
      if (!css || this.closed) return;
      bytes += css.length;
      if (bytes > 2 * 1024 * 1024) return;
      for (const match of css.matchAll(
        /@import\s+(?:url\(\s*)?["']([^"']+)["']/gi,
      )) {
        const resolved = new URL(match[1], `https://quire.invalid/${href}`);
        if (resolved.origin === 'https://quire.invalid')
          await read(decodeURI(resolved.pathname.slice(1)));
      }
      result.push(css);
    };
    for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
      const href = link.getAttribute('href')!;
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
      await read(section.resolveHref(href));
    }
    return result;
  }
  async open(cfi?: string): Promise<RsvpSection | null> {
    const target = cfi
      ? ((await this.locator.resolveNavigation(cfi)) as
          { index: number; anchor?: (doc: Document) => Range } | undefined)
      : undefined;
    const section = await this.next(target?.index ?? 0);
    if (section && target?.anchor && section.index === target.index) {
      const range = target.anchor(await this.document(section.index));
      if (range instanceof Range)
        section.tokenIndex = tokenAtRange(section.tokens, range);
    }
    return section;
  }
  async next(index: number): Promise<RsvpSection | null> {
    if (this.closed) throw new Error('RSVP is closed.');
    const count = this.book.sections?.length ?? 0;
    for (let i = Math.max(0, index); i < count; i++) {
      for (const key of this.documents.keys())
        if (key !== i && key !== i + 1) this.documents.delete(key);
      const doc = await this.document(i);
      const tokens = tokenizeRsvp(
        doc,
        this.locale ?? doc.documentElement.lang,
        this.styles.get(doc),
      );
      if (!tokens.length) continue;
      if (i + 1 < count) void this.document(i + 1).catch(() => {});
      return { index: i, tokens, tokenIndex: 0 };
    }
    this.documents.clear();
    return null;
  }
  cfi(section: RsvpSection, index: number): string {
    return this.locator.getCFI(
      section.index,
      tokenRange(section.tokens[index]),
    );
  }
  dispose() {
    this.closed = true;
    this.documents.clear();
  }
}
