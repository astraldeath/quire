import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { Book } from './domain/models';
import {
  buildBookStructure,
  chapterLabel,
  inferSeriesVolume,
  type BookStructure,
  type ChapterLink,
} from './domain/book-structure';

const MB = 1024 * 1024;
const CSP =
  "default-src 'none'; script-src 'none'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const xml = (text: string) => {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))
    throw new Error('EPUB XML contains unsupported document entities.');
  text = text.replace(/<!DOCTYPE[^>]*>/gi, '');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('EPUB contains malformed XML.');
  return doc;
};
const localPath = (name: string) => {
  if (
    !name ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').includes('..') ||
    /[:\u0000-\u001f]/.test(name)
  )
    throw new Error('EPUB contains an unsafe archive path.');
  return name;
};

/** Defense in depth: remove active content, then deny scripts/network before parsing the body. */
export function sanitizeDocument(text: string, html = false): string {
  // Template contents are inert, with a separate owner document and no browsing
  // context: unlike DOMParser(text/html), parsing cannot fetch image/frame URLs.
  const doc = html ? document.implementation.createHTMLDocument('') : xml(text);
  const template = html ? doc.createElement('template') : null;
  if (template) {
    template.innerHTML = text;
    // Fragment parsing omits html/body wrappers. Recover their attributes using
    // a standards-based, non-browser AST parser; never activate the source DOM.
    const tree = parse(text);
    const root = tree.childNodes.find(
      (node): node is DefaultTreeAdapterMap['element'] =>
        'tagName' in node && node.tagName === 'html',
    );
    const body = root?.childNodes.find(
      (node): node is DefaultTreeAdapterMap['element'] =>
        'tagName' in node && node.tagName === 'body',
    );
    for (const [source, target] of [
      [root, doc.documentElement],
      [body, doc.body],
    ] as const) {
      for (const attr of source?.attrs ?? []) {
        try {
          target.setAttributeNS(
            attr.namespace ?? null,
            attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name,
            attr.value,
          );
        } catch {
          /* An HTML-only attribute name cannot be represented in XHTML. */
        }
      }
    }
  }
  const content = template?.content ?? doc;
  const elements = [
    ...content.querySelectorAll('*'),
    ...(template ? doc.querySelectorAll('*') : []),
  ];
  for (const el of elements) {
    if (
      [
        'script',
        'iframe',
        'frame',
        'frameset',
        'object',
        'embed',
        'base',
        'form',
        'foreignobject',
        'animate',
        'set',
        'animatetransform',
      ].includes(el.localName.toLowerCase()) ||
      (el.localName === 'meta' && el.hasAttribute('http-equiv'))
    ) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      if (
        /^on/i.test(attr.localName) ||
        ['srcdoc', 'srcset', 'action', 'formaction', 'ping', 'target'].includes(
          attr.localName,
        ) ||
        (['href', 'src', 'poster'].includes(attr.localName) &&
          /^(?:[\s\u0000-\u0020]*[a-z][a-z0-9+.-]*:|\s*\/\/)/i.test(attr.value))
      )
        el.removeAttributeNode(attr);
    }
  }
  const head = doc.getElementsByTagName('head')[0];
  if (head) {
    const meta = doc.createElementNS('http://www.w3.org/1999/xhtml', 'meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', CSP);
    head.prepend(meta);
  } else if (doc.documentElement.localName.toLowerCase() === 'html') {
    const head = doc.createElementNS('http://www.w3.org/1999/xhtml', 'head');
    const meta = doc.createElementNS('http://www.w3.org/1999/xhtml', 'meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', CSP);
    head.append(meta);
    doc.documentElement.prepend(head);
  }
  if (template) doc.body.append(template.content);
  return new XMLSerializer().serializeToString(doc.documentElement);
}

export async function openArchive(bytes: Uint8Array) {
  if (bytes.length > 128 * MB)
    throw new Error('EPUB is too large (128 MB maximum).');
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
  });
  const files = new Map<string, Uint8Array>();
  let total = 0;
  try {
    let count = 0;
    let yieldedAt = performance.now();
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > 5000) throw new Error('EPUB has too many archive entries.');
      localPath(entry.filename);
      if (entry.directory) continue;
      if (files.has(entry.filename))
        throw new Error('EPUB has duplicate archive paths.');
      if (entry.encrypted)
        throw new Error(
          'DRM or password-protected EPUBs are unsupported. Import a DRM-free EPUB.',
        );
      if (
        entry.uncompressedSize > 24 * MB ||
        total + entry.uncompressedSize > 256 * MB
      )
        throw new Error('EPUB expanded resources are too large.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      await entry.getData(
        new WritableStream<Uint8Array>({
          write(chunk) {
            size += chunk.length;
            total += chunk.length;
            if (size > 24 * MB || total > 256 * MB)
              throw new Error('EPUB expanded resources are too large.');
            chunks.push(chunk);
          },
        }),
        { checkSignature: true },
      );
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      files.set(entry.filename, data);
      if (performance.now() - yieldedAt > 12) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        yieldedAt = performance.now();
      }
    }
  } catch (error) {
    throw new Error(
      `Cannot open EPUB: ${error instanceof Error ? error.message : 'invalid archive'}`,
    );
  } finally {
    await reader.close();
  }
  const text = (path: string) => new TextDecoder().decode(files.get(path));
  if (text('mimetype').trim() !== 'application/epub+zip')
    throw new Error('This file is not a valid EPUB.');
  if (files.has('META-INF/encryption.xml')) {
    const enc = xml(text('META-INF/encryption.xml'));
    for (const item of Array.from(
      enc.getElementsByTagNameNS('*', 'EncryptionMethod'),
    )) {
      if (
        ![
          'http://www.idpf.org/2008/embedding',
          'http://ns.adobe.com/pdf/enc#RC',
        ].includes(item.getAttribute('Algorithm') ?? '')
      )
        throw new Error(
          'DRM-protected EPUBs are unsupported. Import a DRM-free EPUB.',
        );
    }
  }
  const container = xml(text('META-INF/container.xml'));
  const path = localPath(
    container
      .getElementsByTagNameNS('*', 'rootfile')[0]
      ?.getAttribute('full-path') ?? '',
  );
  const opf = xml(text(path));
  if (
    Array.from(opf.getElementsByTagNameNS('*', 'meta')).some(
      (x) =>
        x.getAttribute('property') === 'rendition:layout' &&
        x.textContent?.trim() === 'pre-paginated',
    ) ||
    Array.from(opf.getElementsByTagNameNS('*', 'itemref')).some((x) =>
      x.getAttribute('properties')?.includes('rendition:layout-pre-paginated'),
    ) ||
    /<option[^>]*name=["']fixed-layout["'][^>]*>\s*true/i.test(
      text('META-INF/com.apple.ibooks.display-options.xml'),
    )
  )
    throw new Error(
      'Fixed-layout EPUBs are not supported yet. Choose a reflowable EPUB edition.',
    );
  if (!opf.getElementsByTagNameNS('*', 'itemref').length)
    throw new Error('EPUB has no readable chapters.');
  const base = path.slice(0, path.lastIndexOf('/') + 1);
  const resolve = (href: string) => {
    const url = new URL(href, `https://epub.invalid/${base}`);
    if (url.origin !== 'https://epub.invalid')
      throw new Error('EPUB manifest contains a remote resource.');
    return localPath(decodeURIComponent(url.pathname.slice(1)));
  };
  const manifest = Array.from(opf.getElementsByTagNameNS('*', 'item'));
  const itemsById = new Map<string, Element>();
  for (const item of manifest) {
    // Match the previous find() behavior even for malformed duplicate IDs.
    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
  }
  const types = new Map(
    manifest.map((item) => [
      resolve(item.getAttribute('href') ?? ''),
      item.getAttribute('media-type') ?? '',
    ]),
  );
  for (const ref of Array.from(opf.getElementsByTagNameNS('*', 'itemref'))) {
    const id = ref.getAttribute('idref');
    const item = id === null ? undefined : itemsById.get(id);
    if (!item || !files.has(resolve(item.getAttribute('href') ?? '')))
      throw new Error('EPUB is missing a required chapter.');
    if (
      !['application/xhtml+xml', 'text/html'].includes(
        item.getAttribute('media-type') ?? '',
      )
    )
      throw new Error(
        'This EPUB chapter format is unsupported. Choose a reflowable XHTML EPUB.',
      );
  }
  return {
    files,
    opf,
    resolve,
    getSize: (name: string) => files.get(name)?.length ?? 0,
    loadText: async (name: string) => {
      if (!files.has(name)) return null;
      const type = types.get(name);
      const value = text(name);
      return ['application/xhtml+xml', 'text/html', 'image/svg+xml'].includes(
        type ?? '',
      )
        ? sanitizeDocument(value, type === 'text/html')
        : value;
    },
    loadBlob: async (name: string) => {
      const data = files.get(name);
      if (!data) return null;
      const type = types.get(name) ?? 'application/octet-stream';
      return new Blob([data.slice().buffer], { type });
    },
  };
}

/** Combine publication navigation with chapter headings in reading order. */
export function detectBookStructure(
  archive: Awaited<ReturnType<typeof openArchive>>,
): BookStructure {
  const { opf, resolve, files } = archive;
  const items = Array.from(opf.getElementsByTagNameNS('*', 'item'));
  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref')).map(
    (ref) => {
      // Keep section indices aligned with Foliate while excluding auxiliary
      // documents that its normal next/previous navigation skips.
      if (ref.getAttribute('linear') === 'no') return '';
      const item = items.find((item) => item.id === ref.getAttribute('idref'));
      return item ? resolve(item.getAttribute('href') ?? '') : '';
    },
  );
  const navigation = items.find((item) =>
    item.getAttribute('properties')?.split(/\s+/).includes('nav'),
  );
  const ncxId = opf
    .getElementsByTagNameNS('*', 'spine')[0]
    ?.getAttribute('toc');
  const ncx =
    items.find((item) => item.id === ncxId) ??
    items.find(
      (item) => item.getAttribute('media-type') === 'application/x-dtbncx+xml',
    );
  let navigationLinks: ChapterLink[] = [];
  for (const item of [navigation, ncx]) {
    if (!item) continue;
    try {
      const path = resolve(item.getAttribute('href') ?? '');
      const data = files.get(path);
      if (!data) continue;
      const doc = xml(new TextDecoder().decode(data));
      const links: ChapterLink[] = [];
      const add = (label: string, href: string | null) => {
        if (!href) return;
        const url = new URL(href, `https://epub.invalid/${path}`);
        if (url.origin !== 'https://epub.invalid') return;
        const target = localPath(decodeURIComponent(url.pathname.slice(1)));
        if (!files.has(target)) return;
        links.push({ label: label.trim(), href: target + url.hash });
      };
      if (item === navigation) {
        const toc = Array.from(doc.getElementsByTagNameNS('*', 'nav')).find(
          (nav) =>
            (
              nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
              nav.getAttribute('epub:type') ??
              ''
            )
              .split(/\s+/)
              .includes('toc'),
        );
        for (const a of Array.from(toc?.getElementsByTagNameNS('*', 'a') ?? []))
          add(a.textContent ?? '', a.getAttribute('href'));
      } else {
        for (const point of Array.from(
          doc.getElementsByTagNameNS('*', 'navPoint'),
        )) {
          const label = Array.from(point.children).find(
            (child) => child.localName === 'navLabel',
          );
          const content = Array.from(point.children).find(
            (child) => child.localName === 'content',
          );
          add(label?.textContent ?? '', content?.getAttribute('src') ?? null);
        }
      }
      if (links.length) {
        if (links.some((link) => chapterLabel(link.label))) {
          navigationLinks = links;
          break;
        }
        if (!navigationLinks.length) navigationLinks = links;
      }
    } catch {
      // Optional malformed navigation must not prevent opening a readable EPUB.
    }
  }
  const links: ChapterLink[] = [];
  const types = (element: Element) =>
    (
      element.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
      element.getAttribute('epub:type') ??
      ''
    ).split(/\s+/);
  for (const path of spine) {
    if (!path) continue;
    const nav = navigationLinks.filter(
      (link) => link.href.split('#')[0] === path,
    );
    const numbered = nav.filter((link) => chapterLabel(link.label));
    const headings: ChapterLink[] = [];
    try {
      const data = files.get(path);
      if (data) {
        const doc = xml(new TextDecoder().decode(data));
        for (const heading of Array.from(
          doc.querySelectorAll('h1, h2, h3, h4, h5, h6'),
        )) {
          let semantic = false;
          let excluded = false;
          let id = heading.id;
          for (
            let parent: Element | null = heading;
            parent;
            parent = parent.parentElement
          ) {
            const tokens = types(parent);
            if (
              tokens.includes('chapter') ||
              parent.getAttribute('role') === 'doc-chapter'
            ) {
              semantic = true;
              id ||= parent.id;
            }
            if (
              tokens.some((t) =>
                [
                  'frontmatter',
                  'backmatter',
                  'toc',
                  'page-list',
                  'cover',
                  'titlepage',
                  'copyright-page',
                  'prologue',
                  'epilogue',
                  'appendix',
                  'footnotes',
                  'endnotes',
                ].includes(t),
              ) ||
              parent.localName === 'nav' ||
              parent.getAttribute('aria-hidden') === 'true' ||
              parent.hasAttribute('hidden')
            )
              excluded = true;
          }
          const label = heading.textContent?.trim() ?? '';
          if (excluded || !chapterLabel(label)) continue;
          // Multiple chapters in one document require real anchors for progress.
          if (!id && headings.length) continue;
          const href = path + (id ? '#' + encodeURIComponent(id) : '');
          const target = nav.find((link) => link.href === href);
          headings.push({ label, href: target?.href ?? href, semantic });
        }
      }
    } catch {
      // Malformed optional heading markup must not prevent reading the book.
    }
    if (numbered.length) {
      if (
        headings.some((heading) => {
          const same = numbered.find((link) => link.href === heading.href);
          return (
            same &&
            chapterLabel(same.label)?.number !==
              chapterLabel(heading.label)?.number
          );
        })
      )
        return { chapters: [] };
      links.push(...numbered);
    } else links.push(...headings);
  }
  // Validate original navigation order before using spine-ordered fallbacks.
  if (
    navigationLinks.some((link) => chapterLabel(link.label)?.explicit) &&
    !buildBookStructure(navigationLinks, spine).chapters.length
  )
    return { chapters: [] };
  return buildBookStructure(links, spine);
}

export async function importEpub(
  file: File,
): Promise<{ book: Book; bytes: Uint8Array }> {
  if (file.size > 128 * MB)
    throw new Error('EPUB is too large (128 MB maximum).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const archive = await openArchive(bytes);
  const { opf } = archive;
  const metas = Array.from(opf.getElementsByTagNameNS('*', 'meta'));
  const calibre = (name: string) =>
    metas
      .find((x) => x.getAttribute('name') === name)
      ?.getAttribute('content') ?? '';
  const collection = metas.find(
    (x) =>
      x.getAttribute('property') === 'belongs-to-collection' &&
      metas.some(
        (m) =>
          m.getAttribute('refines') === `#${x.id}` &&
          m.getAttribute('property') === 'collection-type' &&
          m.textContent?.trim() === 'series',
      ),
  );
  const series =
    calibre('calibre:series') || collection?.textContent?.trim() || '';
  const index =
    calibre('calibre:series_index') ||
    (collection
      ? metas.find(
          (m) =>
            m.getAttribute('refines') === `#${collection.id}` &&
            m.getAttribute('property') === 'group-position',
        )?.textContent
      : '');
  const title =
    opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ||
    file.name?.replace(/\.epub$/i, '') ||
    'Untitled';
  const inferred = inferSeriesVolume(title, file.name, {
    series,
    volume: index && Number.isFinite(Number(index)) ? Number(index) : null,
  });
  let cover = '';
  const coverId = calibre('cover');
  const coverItem = Array.from(opf.getElementsByTagNameNS('*', 'item')).find(
    (x) =>
      x.getAttribute('properties')?.split(/\s+/).includes('cover-image') ||
      (coverId && x.id === coverId),
  );
  if (
    coverItem &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(
      coverItem.getAttribute('media-type') ?? '',
    )
  ) {
    const data = archive.files.get(
      archive.resolve(coverItem.getAttribute('href')!),
    );
    if (data && data.length <= 4 * MB) {
      let binary = '';
      for (let i = 0; i < data.length; i += 8192)
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      cover = `data:${coverItem.getAttribute('media-type')};base64,${btoa(binary)}`;
    }
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
      author:
        Array.from(opf.getElementsByTagNameNS('*', 'creator'))
          .map((x) => x.textContent?.trim())
          .filter(Boolean)
          .join(', ') || 'Unknown author',
      series: inferred.series,
      volume: inferred.volume,
      cover,
      addedAt: Date.now(),
      local: true,
    },
  };
}
