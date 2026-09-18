import { EPUB, type TocItem } from 'foliate-js/epub.js';
import {
  importEpub,
  openArchive,
  openZip,
  detectBookStructure,
  CSP,
} from './epub';
import { SafeBookParser } from './safe-book-parser';
import {
  inferSeriesVolume,
  buildBookStructure,
  type BookStructure,
} from './domain/book-structure';
import type { Book } from './domain/models';

export type BookFormat = 'epub' | 'cbz' | 'fb2' | 'fbz' | 'mobi' | 'azw3';
export const BOOK_ACCEPT = '.epub,.cbz,.fb2,.fb2.zip,.fbz,.mobi,.azw3';
export const BOOK_MIME: Record<BookFormat, string> = {
  epub: 'application/epub+zip',
  cbz: 'application/vnd.comicbook+zip',
  fb2: 'application/x-fictionbook+xml',
  fbz: 'application/x-zip-compressed-fb2',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook',
};
export function inferBookFormat(name: string): BookFormat | undefined {
  if (/\.(?:fb2\.zip|fbz)$/i.test(name)) return 'fbz';
  return /\.(epub|cbz|fb2|mobi|azw3)$/i.exec(name)?.[1].toLowerCase() as
    BookFormat | undefined;
}
interface Section {
  id: string | number;
  load(): Promise<string> | string;
  unload?(): void;
  createDocument?(): Promise<Document> | Document;
  size: number;
}
export interface ReaderBook {
  toc?: TocItem[];
  sections?: Section[];
  metadata?: {
    title?: string;
    author?: string | (string | { name: string })[];
  };
  getCover?(): Promise<Blob | null> | Blob | null;
  destroy(): void;
}
const MB = 1024 * 1024;
const imageType = (name: string) =>
  ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
  })[name.split('.').pop()?.toLowerCase() ?? ''];

async function comic(bytes: Uint8Array): Promise<ReaderBook> {
  const files = await openZip(bytes);
  const names = [...files.keys()]
    .filter((name) => imageType(name) && !name.startsWith('__MACOSX/'))
    .sort(
      (a, b) =>
        a.localeCompare(b, 'en', { numeric: true }) || a.localeCompare(b),
    );
  if (!names.length) throw new Error('CBZ has no supported image pages.');
  const urls = new Set<string>();
  const blob = (name: string) =>
    new Blob([files.get(name)!.slice().buffer], { type: imageType(name) });
  const sections = names.map((name) => {
    let page: string | undefined;
    const owned: string[] = [];
    return {
      id: name,
      size: files.get(name)!.length,
      load() {
        if (page) return page;
        const src = URL.createObjectURL(blob(name));
        page = URL.createObjectURL(
          new Blob(
            [
              `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"></head><body style="margin:0"><img src="${src}" alt=""></body></html>`,
            ],
            { type: 'text/html' },
          ),
        );
        owned.push(src, page);
        owned.forEach((url) => urls.add(url));
        return page;
      },
      unload() {
        owned.forEach((url) => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        });
        owned.length = 0;
        page = undefined;
      },
    };
  });
  return Object.assign(
    {
      sections,
      toc: names.map((name, index) => ({
        label: `Page ${index + 1}`,
        href: name,
      })),
      getCover: () => blob(names[0]),
      destroy: () => urls.forEach((url) => URL.revokeObjectURL(url)),
    },
    {
      rendition: { layout: 'pre-paginated' },
      resolveHref: (href: string) => ({ index: names.indexOf(href) }),
      splitTOCHref: (href: string) => [href, null],
      getTOCFragment: (doc: Document) => doc.documentElement,
    },
  );
}

export async function openBook(
  bytes: Uint8Array,
  format: BookFormat = 'epub',
): Promise<{ publication: ReaderBook; structure: BookStructure }> {
  if (!bytes.length || bytes.length > 128 * MB)
    throw new Error('Book is empty or too large (128 MB maximum).');
  if (format === 'epub') {
    const archive = await openArchive(bytes);
    return {
      publication: await new EPUB(archive).init(),
      structure: detectBookStructure(archive),
    };
  }
  if (format === 'cbz')
    return { publication: await comic(bytes), structure: { chapters: [] } };
  let publication: ReaderBook;
  if (format === 'fb2' || format === 'fbz') {
    if (format === 'fbz') {
      const files = await openZip(bytes);
      const books = [...files].filter(([name]) => /\.fb2$/i.test(name));
      if (books.length !== 1)
        throw new Error('FB2 archive must contain exactly one .fb2 book.');
      bytes = books[0][1];
    }
    const declaration = new TextDecoder().decode(bytes.subarray(0, 200));
    const encoding = /encoding=["']([^"']+)/i.exec(declaration)?.[1] ?? 'utf-8';
    const source = new TextDecoder(encoding).decode(bytes);
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source))
      throw new Error('Unsupported FB2 XML entities.');
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (
      doc.querySelector('parsererror') ||
      doc.documentElement.localName !== 'FictionBook' ||
      !doc.querySelector('body')
    )
      throw new Error('Invalid FB2 book.');
    // The converter may fetch its cover, so reject external image references before conversion.
    for (const el of doc.querySelectorAll('image'))
      for (const attr of [...el.attributes])
        if (attr.localName === 'href' && !attr.value.startsWith('#'))
          el.removeAttributeNode(attr);
    for (const el of doc.querySelectorAll('binary'))
      if (
        !/^image\/(png|jpeg|gif|webp|bmp|avif)$/i.test(
          el.getAttribute('content-type') ?? '',
        )
      )
        el.remove();
    const { makeFB2 } = await import('foliate-js/fb2.js');
    publication = await makeFB2(
      new Blob([new XMLSerializer().serializeToString(doc)]),
    );
    const parser = new SafeBookParser();
    const urls = new Set<string>();
    for (const section of publication.sections ?? []) {
      const create = section.createDocument!.bind(section);
      section.createDocument = async () =>
        parser.parseFromString(
          new XMLSerializer().serializeToString(await create()),
          'application/xhtml+xml',
        );
      section.load = async () => {
        const url = URL.createObjectURL(
          new Blob(
            [
              new XMLSerializer().serializeToString(
                await section.createDocument!(),
              ),
            ],
            { type: 'application/xhtml+xml' },
          ),
        );
        urls.add(url);
        return url;
      };
    }
    const destroy = publication.destroy.bind(publication);
    publication.destroy = () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      destroy();
    };
  } else {
    // Foliate's parser is locally adapted to sanitize before HTML parsing and reject DRM.
    const { MOBI, isMOBI } = await import('./vendor/mobi.js');
    const { unzlibSync } = await import('foliate-js/vendor/fflate.js');
    const file = new Blob([bytes.slice().buffer]);
    if (!(await isMOBI(file))) throw new Error('Invalid MOBI/AZW3 book.');
    publication = await new MOBI({ unzlib: unzlibSync }).open(file);
  }
  const links = (publication.toc ?? []).flatMap(function flatten(item): {
    label: string;
    href: string;
  }[] {
    return [
      { label: item.label, href: item.href },
      ...(item.subitems ?? []).flatMap(flatten),
    ];
  });
  return {
    publication,
    structure: buildBookStructure(
      links,
      (publication.sections ?? []).map((section) => String(section.id)),
    ),
  };
}

export async function importBook(
  file: File,
): Promise<{ bytes: Uint8Array; book: Book }> {
  if (file.size > 128 * MB)
    throw new Error('Book is too large (128 MB maximum).');
  const format = inferBookFormat(file.name);
  if (!format)
    throw new Error(
      'Supported formats: EPUB, CBZ, FB2, MOBI and AZW3 (DRM-free).',
    );
  if (format === 'epub') {
    const result = await importEpub(file);
    result.book.format = format;
    return result;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { publication } = await openBook(bytes, format);
  try {
    const title =
      publication.metadata?.title ||
      file.name.replace(/\.(fb2\.zip|epub|cbz|fb2|fbz|mobi|azw3)$/i, '');
    const authors = publication.metadata?.author;
    const author =
      typeof authors === 'string'
        ? authors
        : authors?.map((a) => (typeof a === 'string' ? a : a.name)).join(', ');
    let cover = '';
    const coverBlob = await publication.getCover?.();
    if (
      coverBlob &&
      coverBlob.size <= 4 * MB &&
      /^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(coverBlob.type)
    ) {
      const data = new Uint8Array(await coverBlob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < data.length; i += 8192)
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      cover = `data:${coverBlob.type};base64,${btoa(binary)}`;
    }
    const id = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (x) => x.toString(16).padStart(2, '0'),
    ).join('');
    return {
      bytes,
      book: {
        id,
        title,
        author: author || 'Unknown author',
        ...inferSeriesVolume(title, file.name),
        format,
        cover,
        addedAt: Date.now(),
        local: true,
      },
    };
  } finally {
    publication.destroy();
  }
}
