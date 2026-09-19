// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { importEpub, sanitizeDocument } from '../src/epub';
import { readFile } from 'node:fs/promises';

async function fixture(
  extra = '',
  path = 'EPUB/chapter.xhtml',
  additions: Record<string, string> = {},
  calibre = true,
) {
  const zip = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, text] of Object.entries({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml':
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'EPUB/package.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Metadata fixture</dc:title><dc:creator>Quire</dc:creator>${calibre ? '<meta name="calibre:series" content="Test collection"/><meta name="calibre:series_index" content="2"/>' : ''}${extra}</metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`,
    [path]:
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><p>Original fixture text.</p></body></html>',
    ...additions,
  }))
    await zip.add(name, new TextReader(text));
  const bytes = await zip.close();
  return {
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
    name: 'fixture.epub',
  } as File;
}
describe('EPUB import boundary', () => {
  it('extracts metadata and stable content identity', async () => {
    const file = await fixture();
    const a = await importEpub(file);
    const b = await importEpub(file);
    expect(a.book).toMatchObject({
      title: 'Metadata fixture',
      author: 'Quire',
      series: 'Test collection',
      volume: 2,
      local: true,
    });
    expect(a.book.id).toMatch(/^[a-f0-9]{64}$/);
    expect(a.book.id).toBe(b.book.id);
  });
  it('rejects fixed layout with an actionable message', async () => {
    await expect(
      importEpub(
        await fixture('<meta property="rendition:layout">pre-paginated</meta>'),
      ),
    ).rejects.toThrow(/fixed.layout/i);
  });
  it('rejects archive traversal', async () => {
    await expect(
      importEpub(await fixture('', '../escape.xhtml')),
    ).rejects.toThrow(/path|filename/i);
  });
  it('does not impose the server upload limit on local EPUB imports', async () => {
    const file = await fixture();
    Object.defineProperty(file, 'size', { value: 300 * 1024 * 1024 });
    await expect(importEpub(file)).resolves.toMatchObject({
      book: { title: 'Metadata fixture' },
    });
  });
  it('neutralizes active documents and applies network-denying CSP before content', () => {
    const result = sanitizeDocument(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="refresh" content="0;url=https://evil.test"/></head><body onload="alert(1)"><script>alert(1)</script><iframe src="https://evil.test"/><a href="javascript:alert(1)">x</a><img src="https://evil.test/a"/></body></html>',
    );
    expect(result).not.toMatch(
      /<script|<iframe|onload=|http-equiv="refresh"|javascript:/,
    );
    expect(result).toContain("script-src 'none'");
    expect(result).toContain("connect-src 'none'");
  });
  it('blocks book scripts before any content even with a script-capable frame', () => {
    const output = sanitizeDocument(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Security-Policy" content="script-src * unsafe-inline"/><script>parent.compromised=true</script></head><body onpointerdown="parent.compromised=true"><a href="javascript:alert(1)">Link</a><p>Text</p></body></html>',
    );
    const doc = new DOMParser().parseFromString(
      output,
      'application/xhtml+xml',
    );
    expect(
      doc.querySelector('head')?.firstElementChild?.getAttribute('content'),
    ).toContain("script-src 'none'");
    expect(doc.querySelector('script')).toBeNull();
    expect(output).not.toContain('onpointerdown');
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('parent.compromised');
  });
  it('accepts ordinary XHTML doctype but rejects entity declarations', () => {
    expect(
      sanitizeDocument(
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>Hello</p></body></html>',
      ),
    ).toContain('Hello');
    expect(() =>
      sanitizeDocument('<!DOCTYPE html [<!ENTITY x "boom">]><html/>'),
    ).toThrow(/entities/i);
  });
  it('sanitizes loose HTML in an inert template without using the resource-loading HTML parser', () => {
    const result = sanitizeDocument(
      '<html><head><title>Legacy</title></head><body><img src="https://evil.test/x"><p onclick="bad()">Hello<br>world</p></body></html>',
      true,
    );
    expect(result).not.toContain('https://evil.test');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Hello');
    expect(result).toContain('Content-Security-Policy');
  });
  it('preserves loose HTML language, RTL direction and body class while stripping active root attributes', () => {
    const result = sanitizeDocument(
      '<html lang="ar" dir="rtl" onload="bad()"><head><title>RTL</title></head><body class="prose" dir="rtl" onclick="bad()"><p>Text</p></body></html>',
      true,
    );
    const doc = new DOMParser().parseFromString(
      result,
      'application/xhtml+xml',
    );
    expect(doc.documentElement.getAttribute('lang')).toBe('ar');
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
    expect(doc.querySelector('body')?.getAttribute('class')).toBe('prose');
    expect(doc.querySelector('body')?.getAttribute('dir')).toBe('rtl');
    expect(result).not.toMatch(/onload|onclick/);
  });
  it('rejects protected EPUB encryption', async () => {
    await expect(
      importEpub(
        await fixture('', 'EPUB/chapter.xhtml', {
          'META-INF/encryption.xml':
            '<encryption><EncryptionMethod Algorithm="urn:drm:test"/></encryption>',
        }),
      ),
    ).rejects.toThrow(/DRM/);
  });
  it('rejects malformed archives', async () => {
    await expect(
      importEpub({
        size: 4,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      } as File),
    ).rejects.toThrow(/EPUB/);
  });
  it('rejects a spine pointing at a missing chapter', async () => {
    await expect(
      importEpub(await fixture('', 'EPUB/other.xhtml')),
    ).rejects.toThrow(/chapter/i);
  });
  it('rejects excessive decompression even when the compressed file is small', async () => {
    const file = await fixture('', 'EPUB/chapter.xhtml', {
      'huge.txt': 'x'.repeat(25 * 1024 * 1024),
    });
    expect(file.size).toBeLessThan(1024 * 1024);
    await expect(importEpub(file)).rejects.toThrow(/large/);
  });
  it('imports the unmodified public-domain Alice EPUBs with safe covers', async () => {
    const results = [];
    for (const name of ['alice-in-wonderland', 'through-the-looking-glass']) {
      const data = await readFile(`tests/fixtures/${name}.epub`);
      results.push(
        await importEpub({
          size: data.length,
          arrayBuffer: async () => Uint8Array.from(data).buffer,
        } as File),
      );
    }
    expect(results[0].book.title).toMatch(/Alice.*Adventures in Wonderland/i);
    expect(results[1].book.title).toMatch(/Through the Looking-Glass/i);
    for (const result of results) {
      expect(result.book.author).toMatch(/Carroll/);
      expect(result.book.cover).toMatch(/^data:image\/(png|jpeg);base64,/);
    }
    expect(results[0].book.id).not.toBe(results[1].book.id);
  });
  it('extracts EPUB3 series metadata', async () => {
    const file = await fixture(
      '<meta property="belongs-to-collection" id="s">EPUB3 collection</meta><meta refines="#s" property="collection-type">series</meta><meta refines="#s" property="group-position">3</meta>',
      'EPUB/chapter.xhtml',
      {},
      false,
    );
    const { book } = await importEpub(file);
    expect(book.series).toBe('EPUB3 collection');
    expect(book.volume).toBe(3);
  });
});

describe('EPUB structure detection', () => {
  it.each([false, true])(
    'combines TOC numbering and heading fallback; conflict=%s',
    async (conflict) => {
      const { openArchive, detectBookStructure } = await import('../src/epub');
      const file = await fixture(
        '',
        'EPUB/chapter.xhtml',
        {
          'EPUB/package.opf':
            '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
          'EPUB/nav.xhtml':
            '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="a.xhtml">Chapter 1</a><a href="b.xhtml">Departure</a></nav></body></html>',
          'EPUB/a.xhtml': `<html><body><h1>Chapter ${conflict ? 5 : 1}</h1></body></html>`,
          'EPUB/b.xhtml': '<html><body><h1>Ch. 2 Departure</h1></body></html>',
        },
        false,
      );
      expect(
        detectBookStructure(
          await openArchive(new Uint8Array(await file.arrayBuffer())),
        ).chapters.map((c) => c.number),
      ).toEqual(conflict ? [] : [1, 2]);
    },
  );
  it('uses in-book headings when TOC labels omit chapter numbers', async () => {
    const { openArchive, detectBookStructure } = await import('../src/epub');
    const file = await fixture(
      '',
      'EPUB/chapter.xhtml',
      {
        'EPUB/package.opf':
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
        'EPUB/nav.xhtml':
          '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="a.xhtml">Arrival</a><a href="b.xhtml">Departure</a></nav></body></html>',
        'EPUB/a.xhtml':
          '<html><body><h1>001 Arrival</h1><p>Story</p></body></html>',
        'EPUB/b.xhtml':
          '<html><body><h1>0002 Departure</h1><p>Story</p></body></html>',
      },
      false,
    );
    const structure = detectBookStructure(
      await openArchive(new Uint8Array(await file.arrayBuffer())),
    );
    expect(structure.chapters.map((c) => c.number)).toEqual([1, 2]);
  });
  it('detects semantic chapter headings without navigation and ignores front matter', async () => {
    const { openArchive, detectBookStructure } = await import('../src/epub');
    const file = await fixture(
      '',
      'EPUB/chapter.xhtml',
      {
        'EPUB/chapter.xhtml':
          '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><section epub:type="frontmatter"><h1>Chapter 99</h1></section><section epub:type="chapter" id="one"><h2>01 Arrival</h2></section><section epub:type="chapter" id="two"><h2>02 Departure</h2></section></body></html>',
      },
      false,
    );
    const structure = detectBookStructure(
      await openArchive(new Uint8Array(await file.arrayBuffer())),
    );
    expect(structure.chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(structure.chapters[1].hrefs).toContain('EPUB/chapter.xhtml#two');
  });
  it('infers a volume from the explicit filename when embedded series metadata is absent', async () => {
    const file = await fixture('', 'EPUB/chapter.xhtml', {}, false);
    Object.defineProperty(file, 'name', {
      value: 'That Time I Got Reincarnated as a Slime, Vol. 5.epub',
    });
    const { book } = await importEpub(file);
    expect(book).toMatchObject({
      series: 'That Time I Got Reincarnated as a Slime',
      volume: 5,
    });
  });
  it('maps NCX chapter parts to real spine positions without assigning a volume', async () => {
    const { openArchive, detectBookStructure } = await import('../src/epub');
    const file = await fixture(
      '',
      'EPUB/chapter.xhtml',
      {
        'EPUB/package.opf':
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Destiny Unchain Online</dc:title></metadata><manifest><item id="toc" href="nav/toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="toc"><itemref idref="a"/><itemref idref="b"/><itemref idref="c"/></spine></package>',
        'EPUB/nav/toc.ncx':
          '<ncx><navMap><navPoint><navLabel><text>Prologue 1</text></navLabel><content src="../a.xhtml#intro"/></navPoint><navPoint><navLabel><text>Chapter 1 Part 1</text></navLabel><content src="../b.xhtml"/></navPoint><navPoint><navLabel><text>Chapter 1 Part 2</text></navLabel><content src="../c.xhtml"/></navPoint></navMap></ncx>',
        'EPUB/a.xhtml': '<html><body>Prologue</body></html>',
        'EPUB/b.xhtml': '<html><body>Part one</body></html>',
        'EPUB/c.xhtml': '<html><body>Part two</body></html>',
      },
      false,
    );
    const { book, bytes } = await importEpub(file);
    expect(book.volume).toBeNull();
    const structure = detectBookStructure(await openArchive(bytes));
    expect(structure.chapters).toEqual([
      {
        number: 1,
        label: 'Chapter 1 Part 1',
        hrefs: ['EPUB/b.xhtml', 'EPUB/c.xhtml'],
        startSpineIndex: 1,
        endSpineIndex: 2,
      },
    ]);
  });
  it('prefers EPUB3 navigation and excludes page-list navigation', async () => {
    const { openArchive, detectBookStructure } = await import('../src/epub');
    const file = await fixture(
      '',
      'EPUB/chapter.xhtml',
      {
        'EPUB/package.opf':
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>',
        'EPUB/nav.xhtml':
          '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="page-list"><a href="chapter.xhtml#p1">Chapter 99</a></nav><nav epub:type="toc"><ol><li><a href="chapter.xhtml#one">Chapter 1</a></li><li><a href="chapter.xhtml#two">Chapter 2</a></li></ol></nav></body></html>',
      },
      false,
    );
    const structure = detectBookStructure(
      await openArchive(new Uint8Array(await file.arrayBuffer())),
    );
    expect(structure.chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(structure.chapters[1].hrefs).toEqual(['EPUB/chapter.xhtml#two']);
  });
});

describe('readable EPUB spine boundaries', () => {
  it('completes at the final linear chapter despite non-linear appendix entries', async () => {
    const { openArchive, detectBookStructure } = await import('../src/epub');
    const { completedChapterAt } = await import('../src/domain/book-structure');
    const file = await fixture(
      '',
      'EPUB/chapter.xhtml',
      {
        'EPUB/package.opf':
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="a" href="appendix.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a" linear="no"/><itemref idref="c"/><itemref idref="a" linear="no"/></spine></package>',
        'EPUB/nav.xhtml':
          '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="chapter.xhtml">Chapter 1</a><a href="appendix.xhtml">Chapter 999</a></nav></body></html>',
        'EPUB/appendix.xhtml': '<html><body>Optional appendix</body></html>',
      },
      false,
    );
    const structure = detectBookStructure(
      await openArchive(new Uint8Array(await file.arrayBuffer())),
    );
    expect(structure.chapters).toHaveLength(1);
    expect(structure.chapters[0]).toMatchObject({
      startSpineIndex: 1,
      endSpineIndex: 1,
    });
    expect(completedChapterAt(structure, { spineIndex: 1, atEnd: true })).toBe(
      1,
    );
  });
  it('keeps validation tied to the first manifest item when malformed IDs are duplicated', async () => {
    const file = await fixture('', 'EPUB/chapter.xhtml', {
      'EPUB/package.opf':
        '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="c" href="missing.xhtml" media-type="application/xhtml+xml"/><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>',
    });
    await expect(importEpub(file)).rejects.toThrow(
      /missing a required chapter/,
    );
  });
});
