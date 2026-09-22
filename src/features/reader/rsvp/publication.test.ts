import { describe, it, expect, vi } from 'vitest';
import { RsvpPublication } from './publication';
import { View } from 'foliate-js/view.js';
const doc = (text: string) =>
  new DOMParser().parseFromString(
    `<html><head></head><body><p>${text}</p></body></html>`,
    'text/html',
  );
const section = (text: string) => ({
  id: text,
  size: 100,
  load: vi.fn(),
  createDocument: vi.fn(async () => doc(text)),
});
describe('RSVP publication', () => {
  it('round trips actual Foliate CFIs and prefetches only one document', async () => {
    const sections = [
      section('Hello world.'),
      section('Next chapter'),
      section('Last chapter'),
    ];
    const view = new View();
    Object.assign(view, { book: { sections } });
    const publication = new RsvpPublication({ sections, destroy() {} }, view);
    const first = await publication.open();
    expect(first?.tokens[0].text).toBe('Hello');
    const cfi = publication.cfi(first!, 1);
    const located = await publication.open(cfi);
    expect(located?.tokenIndex).toBe(1);
    expect(sections[1].createDocument).toHaveBeenCalledTimes(1);
    expect(sections[2].createDocument).not.toHaveBeenCalled();
    expect(sections[0].load).not.toHaveBeenCalled();
    publication.dispose();
  });
  it('skips empty sections and ignores late results after disposal', async () => {
    const sections = [section('<img/>'), section('words')];
    const publication = new RsvpPublication(
      { sections, destroy() {} },
      { getCFI: () => '', resolveNavigation: () => undefined },
    );
    expect((await publication.open())?.index).toBe(1);
    publication.dispose();
    await expect(publication.open()).rejects.toThrow('closed');
    let resolve!: (doc: Document) => void;
    const pending = new RsvpPublication(
      {
        sections: [
          {
            ...section(''),
            createDocument: () =>
              new Promise((r) => {
                resolve = r;
              }),
          },
        ],
        destroy() {},
      },
      { getCFI: () => '', resolveNavigation: () => undefined },
    );
    const request = pending.open();
    pending.dispose();
    resolve(doc('late'));
    await expect(request).rejects.toThrow('closed');
  });
});
it('filters locally linked publisher styles without loading network resources', async () => {
  const s = {
    ...section('Visible <span class="hidden">Secret</span>'),
    createDocument: async () =>
      new DOMParser().parseFromString(
        '<html><head><link rel="stylesheet" href="style.css"/></head><body><p>Visible <span class="hidden">Secret</span></p></body></html>',
        'text/html',
      ),
    resolveHref: (href: string) => `EPUB/${href}`,
  };
  const book = {
    sections: [s],
    loadText: vi.fn(async () => '.hidden { display:none }'),
    destroy() {},
  };
  const p = new RsvpPublication(book, {
    getCFI: () => '',
    resolveNavigation: () => undefined,
  });
  expect((await p.open())?.tokens.map((t) => t.text)).toEqual(['Visible']);
  expect(book.loadText).toHaveBeenCalledWith('EPUB/style.css');
  p.dispose();
});
it('round trips locators in the real Alice EPUB', async () => {
  const { readFile } = await import('node:fs/promises');
  const { openBook } = await import('../../../books');
  const bytes = new Uint8Array(
    await readFile('tests/fixtures/alice-in-wonderland.epub'),
  );
  const opened = await openBook(bytes, 'epub');
  const view = new View();
  Object.assign(view, { book: opened.publication });
  const p = new RsvpPublication(opened.publication, view);
  try {
    const first = (await p.open())!;
    expect(first.tokens.length).toBeGreaterThan(0);
    const index = Math.min(5, first.tokens.length - 1);
    const cfi = p.cfi(first, index);
    expect((await p.open(cfi))?.tokenIndex).toBe(index);
    const next = await p.next(first.index + 1);
    expect(next?.index).toBeGreaterThan(first.index);
  } finally {
    p.dispose();
    opened.publication.destroy();
  }
});
