// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { importEpub, sanitizeDocument } from '../src/epub';
import { readFile } from 'node:fs/promises';

async function fixture(extra = '', path = 'EPUB/chapter.xhtml', additions: Record<string, string> = {}, calibre = true) {
  const zip = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, text] of Object.entries({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'EPUB/package.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Metadata fixture</dc:title><dc:creator>Quire</dc:creator>${calibre ? '<meta name="calibre:series" content="Test collection"/><meta name="calibre:series_index" content="2"/>' : ''}${extra}</metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`,
    [path]: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><p>Original fixture text.</p></body></html>',
    ...additions,
  })) await zip.add(name, new TextReader(text));
  const bytes = await zip.close();
  return { size: bytes.length, arrayBuffer: async () => bytes.buffer, name: 'fixture.epub' } as File;
}
describe('EPUB import boundary', () => {
  it('extracts metadata and stable content identity', async () => {
    const file = await fixture(); const a = await importEpub(file); const b = await importEpub(file);
    expect(a.book).toMatchObject({ title: 'Metadata fixture', author: 'Quire', series: 'Test collection', volume: 2, local: true });
    expect(a.book.id).toMatch(/^[a-f0-9]{64}$/); expect(a.book.id).toBe(b.book.id);
  });
  it('rejects fixed layout with an actionable message', async () => {
    await expect(importEpub(await fixture('<meta property="rendition:layout">pre-paginated</meta>'))).rejects.toThrow(/fixed.layout/i);
  });
  it('rejects archive traversal', async () => { await expect(importEpub(await fixture('', '../escape.xhtml'))).rejects.toThrow(/path|filename/i); });
  it('rejects oversized input before reading it', async () => { await expect(importEpub({size: 300*1024*1024} as File)).rejects.toThrow(/large/i); });
  it('neutralizes active documents and applies network-denying CSP before content', () => {
    const result = sanitizeDocument('<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="refresh" content="0;url=https://evil.test"/></head><body onload="alert(1)"><script>alert(1)</script><iframe src="https://evil.test"/><a href="javascript:alert(1)">x</a><img src="https://evil.test/a"/></body></html>');
    expect(result).not.toMatch(/<script|<iframe|onload=|http-equiv="refresh"|javascript:/);
    expect(result).toContain("script-src 'none'"); expect(result).toContain("connect-src 'none'");
  });
  it('blocks book scripts before any content even with a script-capable frame', () => {
    const output = sanitizeDocument('<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Security-Policy" content="script-src * unsafe-inline"/><script>parent.compromised=true</script></head><body onpointerdown="parent.compromised=true"><a href="javascript:alert(1)">Link</a><p>Text</p></body></html>');
    const doc = new DOMParser().parseFromString(output, 'application/xhtml+xml');
    expect(doc.querySelector('head')?.firstElementChild?.getAttribute('content')).toContain("script-src 'none'");
    expect(doc.querySelector('script')).toBeNull();
    expect(output).not.toContain('onpointerdown');
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('parent.compromised');
  });
  it('accepts ordinary XHTML doctype but rejects entity declarations', () => {
    expect(sanitizeDocument('<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>Hello</p></body></html>')).toContain('Hello');
    expect(() => sanitizeDocument('<!DOCTYPE html [<!ENTITY x "boom">]><html/>')).toThrow(/entities/i);
  });
  it('sanitizes loose HTML in an inert template without using the resource-loading HTML parser', () => {
    const result = sanitizeDocument('<html><head><title>Legacy</title></head><body><img src="https://evil.test/x"><p onclick="bad()">Hello<br>world</p></body></html>', true);
    expect(result).not.toContain('https://evil.test'); expect(result).not.toContain('onclick');
    expect(result).toContain('Hello'); expect(result).toContain('Content-Security-Policy');
  });
  it('preserves loose HTML language, RTL direction and body class while stripping active root attributes', () => {
    const result = sanitizeDocument('<html lang="ar" dir="rtl" onload="bad()"><head><title>RTL</title></head><body class="prose" dir="rtl" onclick="bad()"><p>Text</p></body></html>', true);
    const doc = new DOMParser().parseFromString(result, 'application/xhtml+xml');
    expect(doc.documentElement.getAttribute('lang')).toBe('ar');
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
    expect(doc.querySelector('body')?.getAttribute('class')).toBe('prose');
    expect(doc.querySelector('body')?.getAttribute('dir')).toBe('rtl');
    expect(result).not.toMatch(/onload|onclick/);
  });
  it('rejects protected EPUB encryption', async () => {
    await expect(importEpub(await fixture('', 'EPUB/chapter.xhtml', { 'META-INF/encryption.xml': '<encryption><EncryptionMethod Algorithm="urn:drm:test"/></encryption>' }))).rejects.toThrow(/DRM/);
  });
  it('rejects malformed archives', async () => {
    await expect(importEpub({ size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer } as File)).rejects.toThrow(/EPUB/);
  });
  it('rejects a spine pointing at a missing chapter', async () => {
    await expect(importEpub(await fixture('', 'EPUB/other.xhtml'))).rejects.toThrow(/chapter/i);
  });
  it('rejects excessive decompression even when the compressed file is small', async () => {
    const file = await fixture('', 'EPUB/chapter.xhtml', { 'huge.txt': 'x'.repeat(25 * 1024 * 1024) });
    expect(file.size).toBeLessThan(1024 * 1024);
    await expect(importEpub(file)).rejects.toThrow(/large/);
  });
  it('imports the unmodified public-domain Alice EPUBs with safe covers', async () => {
    const results = [];
    for (const name of ['alice-in-wonderland', 'through-the-looking-glass']) {
      const data = await readFile(`tests/fixtures/${name}.epub`);
      results.push(await importEpub({ size: data.length, arrayBuffer: async () => Uint8Array.from(data).buffer } as File));
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
    const file = await fixture('<meta property="belongs-to-collection" id="s">EPUB3 collection</meta><meta refines="#s" property="collection-type">series</meta><meta refines="#s" property="group-position">3</meta>', 'EPUB/chapter.xhtml', {}, false);
    const { book } = await importEpub(file);
    expect(book.series).toBe('EPUB3 collection');
    expect(book.volume).toBe(3);
  });
});
