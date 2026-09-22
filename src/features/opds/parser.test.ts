import { describe, expect, it } from 'vitest';
import { parseCatalog, catalogSearchUrl } from './parser';

describe('OPDS catalogs', () => {
  it('reads namespaced Atom with inherited bases, authors and direct acquisitions', () => {
    const feed = parseCatalog(
      `<a:feed xmlns:a="http://www.w3.org/2005/Atom" xml:base="../"><a:title>Books</a:title><a:link rel="next" href="page2"/><a:entry xml:base="files/"><a:id>one</a:id><a:title>A book</a:title><a:author><a:name>Writer</a:name></a:author><a:summary type="html">&lt;b&gt;Hello&lt;/b&gt;</a:summary><a:link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="one.epub"/></a:entry><a:entry><a:title>Fiction</a:title><a:link rel="subsection" type="application/atom+xml" href="fiction"/></a:entry></a:feed>`,
      'application/atom+xml',
      'https://books.test/opds/root',
    );
    expect(feed.publications[0]).toMatchObject({
      title: 'A book',
      authors: ['Writer'],
      summary: 'Hello',
      acquisitions: [{ url: 'https://books.test/files/one.epub' }],
    });
    expect(feed.navigation[0].title).toBe('Fiction');
    expect(feed.next?.url).toBe('https://books.test/page2');
  });
  it('reads JSON groups, facets, covers, search, and publication documents', () => {
    const publication = {
      metadata: {
        identifier: 'one',
        title: 'One',
        author: [{ name: 'Writer' }],
      },
      images: [{ href: 'cover.jpg', type: 'image/jpeg' }],
      links: [
        {
          rel: 'http://opds-spec.org/acquisition',
          href: 'one.epub',
          type: 'application/epub+zip',
        },
      ],
    };
    const feed = parseCatalog(
      JSON.stringify({
        metadata: { title: 'Root' },
        groups: [
          { metadata: { title: 'Recent' }, publications: [publication] },
        ],
        facets: [
          {
            metadata: { title: 'Sort' },
            links: [{ title: 'New', href: '?sort=new' }],
          },
        ],
        links: [
          {
            rel: 'search',
            href: 'search{?query}',
            type: 'application/opds+json',
          },
        ],
      }),
      'application/opds+json',
      'https://books.test/',
    );
    expect(feed.groups[0].publications[0].covers[0].url).toBe(
      'https://books.test/cover.jpg',
    );
    expect(feed.facets[0].links[0].title).toBe('New');
    expect(
      catalogSearchUrl(feed.search!.url, 'a & b', 'https://books.test/'),
    ).toBe('https://books.test/search?query=a%20%26%20b');
    expect(
      parseCatalog(
        JSON.stringify(publication),
        'application/opds-publication+json',
        'https://books.test/',
      ).publications,
    ).toHaveLength(1);
  });
  it('rejects hostile documents and unsafe links', () => {
    expect(() =>
      parseCatalog(
        '<!DOCTYPE feed [<!ENTITY a SYSTEM "file:///secret">]><feed/>',
        'application/atom+xml',
        'https://books.test/',
      ),
    ).toThrow();
    expect(() =>
      parseCatalog('<html>Login</html>', 'text/html', 'https://books.test/'),
    ).toThrow();
    expect(() =>
      parseCatalog('{', 'application/opds+json', 'https://books.test/'),
    ).toThrow();
    const feed = parseCatalog(
      JSON.stringify({
        metadata: { title: 'Root' },
        navigation: [
          { href: 'javascript:alert(1)' },
          { href: 'https://user:pass@books.test/' },
        ],
      }),
      'application/opds+json',
      'https://books.test/',
    );
    expect(feed.navigation).toEqual([]);
  });
  it('preserves unsupported acquisitions for explanation without treating them as direct', () => {
    const feed = parseCatalog(
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Loan</title><link rel="http://opds-spec.org/acquisition/borrow" href="loan"/></entry></feed>',
      'application/atom+xml',
      'https://books.test/',
    );
    expect(feed.publications[0].acquisitions[0].rel).toContain(
      'http://opds-spec.org/acquisition/borrow',
    );
  });
  it('expands OpenSearch terms and rejects unknown required variables', () => {
    expect(
      catalogSearchUrl(
        'https://books.test/?q={searchTerms}&page={startPage?}',
        'two words',
        'https://books.test',
      ),
    ).toBe('https://books.test/?q=two%20words&page=');
    expect(() =>
      catalogSearchUrl('/{required}', 'x', 'https://books.test'),
    ).toThrow();
  });
});
