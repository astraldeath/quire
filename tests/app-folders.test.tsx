import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../src/App';
import { defaults } from '../src/domain/models';
const { books, ensure, saveBook, putBook } = vi.hoisted(() => ({
  saveBook: vi.fn(async (_book: import('../src/domain/models').Book) => {}),
  putBook: vi.fn(
    async (
      _book: import('../src/domain/models').Book,
      _bytes: Uint8Array,
    ) => {},
  ),
  books: [
    {
      id: 'a'.repeat(64),
      title: 'Book One',
      folder: 'Shelf/Nested',
      author: 'Author',
      series: 'A/B',
      volume: 1,
      cover: '',
      addedAt: 1,
      local: true,
    },
    {
      id: 'b'.repeat(64),
      title: 'Book Two',
      folder: 'Shelf',
      author: 'Author',
      series: 'A/B',
      volume: 2,
      cover: '',
      addedAt: 1,
      local: true,
    },
  ],
  ensure: vi.fn(async () => new Uint8Array([1])),
}));
vi.mock('../src/books', async () => ({
  ...(await vi.importActual('../src/books')),
  importBook: vi.fn(async (file: File) => ({
    book: {
      ...books[0],
      id: 'd'.repeat(64),
      title: file.name,
      format: 'cbz',
      folder: undefined,
    },
    bytes: new Uint8Array([1, 2, 3]),
  })),
}));
vi.mock('../src/features/navigation/routes', async () => ({
  ...(await vi.importActual('../src/features/navigation/routes')),
  hostedWeb: true,
}));
vi.mock('../src/storage', () => ({
  devicePrivacyKey: () => 'privacy-folder-test',
  listBooks: async () => books,
  loadPreferences: async () => defaults,
  loadSync: async () => ({ enabled: false }),
  saveBook,
  putBook,
  saveReadingPosition: vi.fn(),
  saveBookAnnotations: vi.fn(),
  listReadingActivity: async () => [],
  saveReadingActivity: vi.fn(async () => {}),
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({
    title,
    children,
    onClose,
  }: {
    title: string;
    children: import('react').ReactNode;
    onClose(): void;
  }) => (
    <section role="dialog">
      <h2>{title}</h2>
      {children}
      <button onClick={onClose}>Cancel privacy</button>
    </section>
  ),
}));
vi.mock('../src/features/sync/engine', () => ({
  startSync: () => () => {},
  subscribe: () => () => {},
  syncNow: async () => {},
}));
vi.mock('../src/features/sync/library', () => ({ ensureBookFile: ensure }));
vi.mock('../src/features/tracking/TrackingDialog', () => ({
  TrackingDialog: () => <aside role="dialog">Tracking</aside>,
}));
vi.mock('../src/features/reader/Reader', () => ({
  Reader: ({ book, onClose }: { book: { title: string }; onClose(): void }) => (
    <section data-reader>
      {book.title}
      <button onClick={onClose}>Leave reader</button>
    </section>
  ),
}));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

books.push({ ...books[0], id: 'c'.repeat(64), title: 'Book Three', volume: 3 });
const libraries = [
  { id: 'one', name: 'First collection', bookIds: [books[0].id, books[2].id] },
  { id: 'two', name: 'Second collection', bookIds: [books[1].id] },
];
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  saveBook.mockClear();
  putBook.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  localStorage.removeItem('privacy-folder-test');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.removeItem('privacy-folder-test');
  history.replaceState(null, '', '/');
});
async function mount(path: string, scoped = false) {
  history.replaceState(null, '', path);
  await act(async () =>
    root.render(<App serverLibraries={scoped ? libraries : []} />),
  );
}
async function click(text: string) {
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === text)!
      .click(),
  );
}
async function input(value: string) {
  const el = host.querySelector<HTMLInputElement>(
    '[role="dialog"] input:not([type="checkbox"])',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
it('keeps private-only folders and counts out of the visible library', async () => {
  localStorage.setItem(
    'privacy-folder-test',
    JSON.stringify({
      version: 1,
      books: { [books[0].id]: 'hidden', [books[2].id]: 'hidden' },
      credential: { salt: 'a'.repeat(32), hash: 'b'.repeat(64) },
    }),
  );
  await mount('/library?folder=Shelf');
  expect(host.querySelector('.books')?.textContent).not.toContain('Nested');
  expect(host.textContent).not.toContain('Book One');
  expect(host.textContent).toContain('Book Two');
});
it('keeps series links scoped to folder and collection, including new tabs', async () => {
  await mount('/library?folder=Shelf%2FNested&collection=one', true);
  const link = host.querySelector<HTMLAnchorElement>(
    '[aria-label="Open series A/B"]',
  )!;
  expect(link).not.toBeNull();
  const url = new URL(link.href);
  expect(url.searchParams.get('folder')).toBe('Shelf/Nested');
  expect(url.searchParams.get('collection')).toBe('one');
  await act(async () => link.click());
  expect(new URLSearchParams(location.search).get('collection')).toBe('one');
  expect(host.textContent).toContain('Book One');
  expect(host.textContent).not.toContain('Book Two');
});
it('renames descendant folders only within the selected collection', async () => {
  await mount('/library?folder=Shelf&collection=one', true);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Folder actions"]')!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent === 'Rename folder')!
      .click(),
  );
  await input('Renamed');
  await submit();
  expect(saveBook).toHaveBeenCalledTimes(2);
  expect(saveBook.mock.calls[0][0]).toMatchObject({
    id: books[0].id,
    folder: 'Renamed/Nested',
  });
  expect(new URLSearchParams(location.search).get('folder')).toBe('Renamed');
  expect(new URLSearchParams(location.search).get('collection')).toBe('one');
});

it('renders nested breadcrumbs with navigable ancestors and a current folder', async () => {
  await mount('/library?folder=Shelf%2FNested&collection=one', true);
  const nav = host.querySelector('[aria-label="Folder breadcrumbs"]')!;
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(
    'Nested',
  );
  const parent = [...nav.querySelectorAll('a')].find(
    (a) => a.textContent === 'Shelf',
  )!;
  expect(new URL(parent.href).searchParams.get('collection')).toBe('one');
  await act(async () => parent.click());
  expect(new URLSearchParams(location.search).get('folder')).toBe('Shelf');
});

it('deletes a folder and descendants without deleting books or other memberships', async () => {
  const original = { ...books[0] };
  Object.assign(books[0], { folders: ['Shelf/Nested', 'Favorites'] });
  try {
    await mount('/library?folder=Shelf');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Folder actions"]')!
        .click(),
    );
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent === 'Delete folder')!
        .click(),
    );
    expect(saveBook).not.toHaveBeenCalled();
    await submit();
    expect(saveBook).toHaveBeenCalledTimes(3);
    expect(saveBook.mock.calls[0][0]).toMatchObject({
      id: books[0].id,
      folders: ['Favorites'],
      folder: 'Favorites',
      local: true,
    });
    expect(saveBook.mock.calls[1][0]).toMatchObject({
      id: books[1].id,
      folders: [],
      folder: '',
      local: true,
    });
    expect(new URLSearchParams(location.search).has('folder')).toBe(false);
  } finally {
    Reflect.deleteProperty(books[0], 'folders');
    Object.assign(books[0], original);
  }
});
it('adds the selected series to another folder without changing existing memberships', async () => {
  await mount('/library?q=Book');
  await click('Select');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
  );
  await click('Folders');
  await click('New folder');
  await input('New shelf');
  await submit();
  expect(saveBook).toHaveBeenCalledTimes(3);
  expect(saveBook.mock.calls.map((call) => call[0])).toEqual(
    books.map((book) => ({ ...book, folders: [book.folder, 'New shelf'] })),
  );
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('shows folder cards instead of duplicating their books at the library root', async () => {
  await mount('/library');
  expect(
    host.querySelector('.books .folder-card [aria-label="Open folder Shelf"]'),
  ).not.toBeNull();
  expect(host.querySelector('.books .folder-card')?.textContent).toContain(
    '3 books',
  );
  expect(
    host.querySelector('.books [aria-label="Open series A/B"]'),
  ).toBeNull();
  expect(host.querySelector('.empty')).toBeNull();
});

it('shows immediate subfolders and directly assigned books within a folder', async () => {
  await mount('/library?folder=Shelf');
  expect(
    host.querySelector('.folder-card [aria-label="Open folder Nested"]'),
  ).not.toBeNull();
  expect(host.querySelector('[aria-label="Open Book Two"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Open Book One"]')).toBeNull();
});

it('imports a picked directory beneath the current folder and skips non-book files', async () => {
  await mount('/library?folder=Shelf');
  const picked = new File(['comic'], 'page.cbz');
  Object.defineProperty(picked, 'webkitRelativePath', {
    value: 'Comics/Volume 1/page.cbz',
  });
  const ignored = new File(['notes'], 'notes.txt');
  const picker = host.querySelector<HTMLInputElement>(
    'input[webkitdirectory]',
  )!;
  Object.defineProperty(picker, 'files', {
    configurable: true,
    value: [picked, ignored],
  });
  await act(async () => {
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(putBook).toHaveBeenCalledTimes(1);
  expect(putBook.mock.calls[0][0]).toMatchObject({
    title: 'page.cbz',
    format: 'cbz',
    folder: 'Shelf/Comics/Volume 1',
  });
  expect(new URLSearchParams(location.search).get('folder')).toBe('Shelf');
  expect(host.textContent).toContain('1 book imported.');
});
