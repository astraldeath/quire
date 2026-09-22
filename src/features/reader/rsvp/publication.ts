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
      pending = Promise.resolve(create.call(this.book.sections![index]));
      this.documents.set(index, pending);
    }
    const doc = await pending;
    if (this.closed) throw new Error('RSVP is closed.');
    return doc;
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
      const tokens = tokenizeRsvp(doc, this.locale ?? doc.documentElement.lang);
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
