import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Catalogs } from '../src/features/opds/Catalogs';
import { OpdsAccessSettings } from '../src/features/opds/OpdsAccessSettings';
import { parseWebRoute } from '../src/features/navigation/routes';
const calls = vi.hoisted(() => ({
  downloads: 0,
  imports: 0,
  book: '',
  passwords: [] as { id: string; name: string; createdAt: number }[],
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section role="dialog" aria-label={title}>
      <button onClick={onClose}>Close</button>
      {children}
    </section>
  ),
}));
vi.mock('../src/features/opds/sources', () => ({
  catalogContext: async () => ({ key: 'test' }),
  listCatalogSources: async () => [
    {
      id: 'one',
      name: 'Test catalog',
      url: 'https://books.test/',
      revision: 1,
      deleted: false,
    },
  ],
  syncCatalogSources: async () => {},
  catalogImported: async (_ctx: any, _url: string, id?: string) => {
    if (id) calls.book = id;
    return calls.book;
  },
  opdsAccountRequest: async (
    _account: any,
    _path: string,
    body?: any,
    method?: string,
  ) => {
    if (method === 'DELETE') {
      calls.passwords = [];
      return;
    }
    if (body) {
      calls.passwords = [{ id: 'key', name: body.name, createdAt: 1 }];
      return { password: 'secret-once' };
    }
    return { passwords: calls.passwords };
  },
}));
vi.mock('../src/features/sync/transport', () => ({
  supportsOpds: async () => true,
}));
vi.mock('../src/features/opds/transport', () => ({
  fetchCatalog: async () => ({
    body: JSON.stringify({
      metadata: { title: 'Fiction' },
      publications: [
        {
          metadata: { identifier: 'book', title: 'A book', author: 'Writer' },
          links: [
            {
              href: 'book.epub',
              type: 'application/epub+zip',
              rel: 'http://opds-spec.org/acquisition',
            },
          ],
        },
      ],
    }),
    contentType: 'application/opds+json',
    url: 'https://books.test/',
  }),
  acquisitionFormat: () => 'epub',
  downloadCatalogBook: async () => {
    calls.downloads++;
    return new File(['data'], 'book.epub');
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  host.replaceChildren();
  root = createRoot(host);
  calls.downloads = 0;
  calls.imports = 0;
  calls.book = '';
  calls.passwords = [];
});
const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  )!;
it('browses without importing and changes Download to Open after an explicit acquisition', async () => {
  const opened: string[] = [];
  await act(async () =>
    root.render(
      <Catalogs
        onClose={() => {}}
        bookIds={[]}
        onOpen={(id) => opened.push(id)}
        onImport={async () => {
          calls.imports++;
          return 'imported-book';
        }}
      />,
    ),
  );
  await act(async () => button('Test catalog').click());
  expect(host.textContent).toContain('A book');
  expect(calls.downloads).toBe(0);
  expect(calls.imports).toBe(0);
  await act(async () => button('A book').click());
  await act(async () => button('Download EPUB').click());
  expect(calls.imports).toBe(1);
  expect(button('Open book')).toBeTruthy();
  await act(async () => button('Open book').click());
  expect(opened).toEqual(['imported-book']);
});
it('recognizes catalog routes and reveals newly created app passwords only until dismissed', async () => {
  expect(parseWebRoute('/catalogs?source=one')).toEqual({ kind: 'catalogs' });
  await act(async () =>
    root.render(
      <OpdsAccessSettings
        account={{
          origin: 'https://quire.test',
          username: 'reader',
          sessionId: 'session',
        }}
      />,
    ),
  );
  const input = host.querySelector<HTMLInputElement>('input[placeholder]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'Tablet');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(
    Array.from(host.querySelectorAll('input')).some(
      (i) => i.value === 'secret-once',
    ),
  ).toBe(true);
  await act(async () => button('Done').click());
  expect(host.innerHTML).not.toContain('secret-once');
  await act(async () => button('Revoke').click());
  expect(host.textContent).not.toContain('Revoke');
});
