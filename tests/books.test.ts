import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { importBook, openBook, inferBookFormat } from '../src/books';
import { SafeBookParser } from '../src/safe-book-parser';

const blobs = new Map<string, Blob>();
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        const url = `blob:test-${blobs.size}`;
        blobs.set(url, blob);
        return url;
      }),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  blobs.clear();
});
async function zip(files: Record<string, string>) {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, value] of Object.entries(files))
    await writer.add(name, new TextReader(value));
  return writer.close();
}
const fb2 =
  '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>Test book</book-title><author><first-name>Ada</first-name><last-name>Reader</last-name></author><coverpage><image l:href="https://evil.test/cover"/></coverpage></title-info></description><body><section id="chapter"><title><p>Chapter 1</p></title><p>Hello reader</p><image l:href="https://evil.test/pixel"/></section></body></FictionBook>';
it('opens CBZ pages in natural order without inventing chapters', async () => {
  const { publication, structure } = await openBook(
    await zip({
      '10.PNG': 'ten',
      '2.png': 'two',
      '1.jpg': 'one',
      'evil.svg': '<svg/>',
    }),
    'cbz',
  );
  expect(publication.sections?.map((s) => s.id)).toEqual([
    '1.jpg',
    '2.png',
    '10.PNG',
  ]);
  expect(structure.chapters).toEqual([]);
  const url = await publication.sections![0].load();
  expect(await blobs.get(url)!.text()).toContain("connect-src 'none'");
  publication.destroy();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
});
it('reads FB2 text and metadata while removing remote images', async () => {
  const bytes = new TextEncoder().encode(fb2);
  const imported = await importBook({
    name: 'test.fb2',
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  } as File);
  expect(imported.book).toMatchObject({
    title: 'Test book',
    author: 'Ada Reader',
    format: 'fb2',
  });
  expect([...imported.bytes]).toEqual([...bytes]);
  const { publication } = await openBook(bytes, 'fb2');
  const url = await publication.sections![0].load();
  const html = await blobs.get(url)!.text();
  expect(html).toContain('Hello reader');
  expect(html).toContain('Content-Security-Policy');
  expect(html).not.toContain('evil.test');
  publication.destroy();
});
it('opens zipped FB2 and rejects ambiguous archives and unsupported extensions', async () => {
  expect(inferBookFormat('BOOK.FB2.ZIP')).toBe('fbz');
  const { publication } = await openBook(await zip({ 'book.fb2': fb2 }), 'fbz');
  expect(publication.sections?.length).toBeGreaterThan(0);
  publication.destroy();
  await expect(
    openBook(await zip({ 'a.fb2': fb2, 'b.fb2': fb2 }), 'fbz'),
  ).rejects.toThrow(/exactly one/);
  await expect(
    importBook({ name: 'book.pdf', size: 1 } as File),
  ).rejects.toThrow(/Supported formats/);
});
it('sanitizes Kindle HTML before parsing, retaining local resources and navigation', () => {
  const doc = new SafeBookParser().parseFromString(
    '<html><body onload="alert(1)"><script>bad()</script><img src="https://evil.test/x"><img src="blob:local"><a href="kindle:pos:fid:0:off:0">Next</a></body></html>',
    'text/html',
  );
  expect(doc.querySelector('script')).toBeNull();
  expect(doc.querySelector('[onload]')).toBeNull();
  expect(doc.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(doc.querySelectorAll('img')[1].getAttribute('src')).toBe('blob:local');
  expect(doc.querySelector('a')?.getAttribute('href')).toMatch(/^kindle:/);
});

function mobi(encrypted = false) {
  const html = new TextEncoder().encode(
    '<html><body><p>Kindle reader text</p><script>bad()</script></body></html>',
  );
  const bytes = new Uint8Array(96 + 256 + html.length);
  const data = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('BOOKMOBI'), 60);
  data.setUint16(76, 2);
  data.setUint32(78, 96);
  data.setUint32(86, 352);
  data.setUint16(96, 1);
  data.setUint16(104, 1);
  data.setUint16(106, 4096);
  data.setUint16(108, encrypted ? 1 : 0);
  bytes.set(new TextEncoder().encode('MOBI'), 112);
  data.setUint32(116, 232);
  data.setUint32(124, 65001);
  data.setUint32(132, 6);
  data.setUint32(180, 248);
  data.setUint32(184, 4);
  data.setUint32(204, 2);
  data.setUint32(340, 0xffffffff);
  bytes.set(new TextEncoder().encode('Test'), 344);
  bytes.set(html, 352);
  return bytes;
}
it('opens a DRM-free MOBI section and rejects encrypted records', async () => {
  const { publication } = await openBook(mobi(), 'mobi');
  const doc = await publication.sections![0].createDocument!();
  expect(doc.body.textContent).toContain('Kindle reader text');
  expect(doc.querySelector('script')).toBeNull();
  expect(await publication.sections![0].load()).toMatch(/^blob:/);
  publication.destroy();
  await expect(openBook(mobi(true), 'mobi')).rejects.toThrow(/DRM/);
});
