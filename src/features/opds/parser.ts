export type CatalogLink = {
  title: string;
  url: string;
  type?: string;
  rel: string[];
  indirect?: boolean;
};
export type CatalogPublication = {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  covers: CatalogLink[];
  acquisitions: CatalogLink[];
  detail?: CatalogLink;
};
export type CatalogFeed = {
  title: string;
  url: string;
  navigation: CatalogLink[];
  publications: CatalogPublication[];
  groups: {
    title: string;
    navigation: CatalogLink[];
    publications: CatalogPublication[];
  }[];
  facets: { title: string; links: CatalogLink[] }[];
  next?: CatalogLink;
  previous?: CatalogLink;
  search?: CatalogLink;
};
const acquisition = 'http://opds-spec.org/acquisition';
const atom = 'http://www.w3.org/2005/Atom';
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10000) : '');
const array = (v: unknown): any[] => (Array.isArray(v) ? v.slice(0, 2000) : []);
const plain = (s: string) =>
  new DOMParser().parseFromString(s, 'text/html').body.textContent?.trim() ??
  '';
export function catalogUrl(raw: string, base?: string): string {
  const u = new URL(raw, base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Use an HTTP or HTTPS catalog URL without credentials.');
  return u.href;
}
function link(v: any, base: string): CatalogLink | undefined {
  try {
    if (!v || typeof v.href !== 'string') return;
    // URL serialization escapes template braces, so restore only these literal delimiters.
    const url = catalogUrl(v.href, base)
      .replace(/%7B/gi, '{')
      .replace(/%7D/gi, '}');
    return {
      title: text(v.title),
      url,
      type: text(v.type) || undefined,
      rel:
        typeof v.rel === 'string'
          ? v.rel.split(/\s+/)
          : array(v.rel).filter((x) => typeof x === 'string'),
      indirect: !!v.properties?.indirectAcquisition,
    };
  } catch {
    return;
  }
}
const links = (values: unknown, base: string) =>
  array(values)
    .map((v) => link(v, base))
    .filter((v): v is CatalogLink => !!v);
const has = (l: CatalogLink, rel: string) => l.rel.includes(rel);
function jsonPublication(v: any, base: string): CatalogPublication {
  const metadata = v?.metadata ?? {};
  const ll = links(v?.links, base);
  const authors = Array.isArray(metadata.author)
    ? metadata.author
    : [metadata.author];
  return {
    id: text(metadata.identifier) || ll[0]?.url || text(metadata.title),
    title: text(metadata.title) || 'Untitled',
    authors: authors
      .map((a) => text(typeof a === 'string' ? a : a?.name))
      .filter(Boolean),
    summary: plain(text(metadata.description)),
    covers: links(v.images, base),
    acquisitions: ll.filter((l) =>
      l.rel.some((r) => r.startsWith(acquisition)),
    ),
    detail: ll.find(
      (l) => has(l, 'alternate') && /opds|atom/.test(l.type ?? ''),
    ),
  };
}
export function parseCatalog(
  body: string,
  contentType: string,
  responseUrl: string,
): CatalogFeed {
  if (body.length > 4 * 1024 * 1024) throw new Error('Catalog is too large.');
  const base = catalogUrl(responseUrl);
  const out: CatalogFeed = {
    title: 'Catalog',
    url: base,
    navigation: [],
    publications: [],
    groups: [],
    facets: [],
  };
  let ll: CatalogLink[];
  if (/json/i.test(contentType) || body.trimStart().startsWith('{')) {
    const v = JSON.parse(body);
    if (!v || typeof v !== 'object' || !v.metadata)
      throw new Error('This is not an OPDS catalog.');
    out.title = text(v.metadata.title) || 'Catalog';
    out.navigation = links(v.navigation, base);
    out.publications = array(v.publications).map((p) =>
      jsonPublication(p, base),
    );
    out.groups = array(v.groups).map((g) => ({
      title: text(g.metadata?.title),
      navigation: links(g.navigation, base),
      publications: array(g.publications).map((p) => jsonPublication(p, base)),
    }));
    out.facets = array(v.facets).map((g) => ({
      title: text(g.metadata?.title),
      links: links(g.links, base),
    }));
    ll = links(v.links, base);
    if (
      !v.publications &&
      !v.navigation &&
      !v.groups &&
      ll.some((l) => l.rel.some((r) => r.startsWith(acquisition)))
    )
      out.publications = [jsonPublication(v, base)];
  } else {
    if (/<!DOCTYPE|<!ENTITY/i.test(body))
      throw new Error('Catalog contains unsupported XML declarations.');
    const doc = new DOMParser().parseFromString(body, 'application/xml');
    const root = doc.documentElement;
    if (
      doc.getElementsByTagName('parsererror').length ||
      root.namespaceURI !== atom ||
      !['feed', 'entry'].includes(root.localName)
    )
      throw new Error('This is not an OPDS catalog.');
    const children = (e: Element, name: string) =>
      Array.from(e.children).filter(
        (c) => c.namespaceURI === atom && c.localName === name,
      );
    const value = (e: Element, name: string) =>
      text(children(e, name)[0]?.textContent);
    const xmlBase = (e: Element): string => {
      const parent = e.parentElement ? xmlBase(e.parentElement) : base;
      const b = e.getAttributeNS(
        'http://www.w3.org/XML/1998/namespace',
        'base',
      );
      return b ? catalogUrl(b, parent) : parent;
    };
    const xmlLinks = (e: Element) =>
      children(e, 'link')
        .map((el) =>
          link(
            {
              href: el.getAttribute('href'),
              title: el.getAttribute('title'),
              type: el.getAttribute('type'),
              rel: el.getAttribute('rel') ?? 'alternate',
              properties: {
                indirectAcquisition:
                  el.getElementsByTagNameNS('*', 'indirectAcquisition')
                    .length || undefined,
              },
            },
            xmlBase(el),
          ),
        )
        .filter((l): l is CatalogLink => !!l);
    out.title = value(root, 'title') || 'Catalog';
    ll = xmlLinks(root);
    for (const e of (root.localName === 'entry'
      ? [root]
      : children(root, 'entry')
    ).slice(0, 2000)) {
      const entryLinks = xmlLinks(e),
        title = value(e, 'title') || 'Untitled';
      const acquisitions = entryLinks.filter((l) =>
        l.rel.some((r) => r.startsWith(acquisition)),
      );
      const detail = entryLinks.find(
        (l) => has(l, 'alternate') && /opds|atom/.test(l.type ?? ''),
      );
      if (acquisitions.length || detail)
        out.publications.push({
          id: value(e, 'id') || acquisitions[0]?.url || title,
          title,
          authors: children(e, 'author').map((a) => value(a, 'name')),
          summary: plain(value(e, 'summary') || value(e, 'content')),
          covers: entryLinks.filter((l) =>
            l.rel.some((r) => r.startsWith('http://opds-spec.org/image')),
          ),
          acquisitions,
          detail,
        });
      else
        for (const l of entryLinks.filter(
          (l) => /opds|atom/.test(l.type ?? '') || has(l, 'subsection'),
        ))
          out.navigation.push({ ...l, title: l.title || title });
    }
    const facetLinks = ll.filter((l) => has(l, 'http://opds-spec.org/facet'));
    if (facetLinks.length)
      out.facets.push({ title: 'Filter', links: facetLinks });
  }
  out.next = ll.find((l) => has(l, 'next'));
  out.previous = ll.find((l) => has(l, 'previous'));
  out.search = ll.find((l) => has(l, 'search'));
  return out;
}
export function catalogSearchUrl(
  template: string,
  query: string,
  baseUrl: string,
): string {
  const q = encodeURIComponent(query);
  const expanded = template
    .replace(
      /\{\?([^}]+)\}/g,
      (_, vars: string) =>
        '?' +
        vars
          .split(',')
          .filter((v) => ['query', 'searchTerms'].includes(v))
          .map((v) => `${v}=${q}`)
          .join('&'),
    )
    .replace(/\{(searchTerms|query)\}/g, q)
    .replace(/\{[^}]+\?\}/g, '');
  if (/[{}]/.test(expanded))
    throw new Error('This catalog uses an unsupported search template.');
  return catalogUrl(expanded, baseUrl);
}
