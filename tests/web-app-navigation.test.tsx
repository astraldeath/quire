import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { App } from '../src/App';
import { defaults } from '../src/domain/models';
import { navigateWeb } from '../src/features/navigation/routes';
const { books, ensure } = vi.hoisted(() => ({
  books: [
    {
      id: 'a'.repeat(64),
      title: 'Book One',
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
vi.mock('../src/features/navigation/routes', async () => ({
  ...(await vi.importActual('../src/features/navigation/routes')),
  hostedWeb: true,
}));
vi.mock('../src/storage', () => ({
  devicePrivacyKey: () => 'privacy-navigation-test',
  listBooks: async () => books,
  loadPreferences: async () => defaults,
  loadSync: async () => ({ enabled: false }),
  loadFolderCatalog: async () => ({ value: { library: [], hidden: [] } }),
  saveReadingPosition: vi.fn(),
  saveBookAnnotations: vi.fn(),
  listReadingActivity: async () => [],
  saveReadingActivity: vi.fn(async () => {}),
  deleteBooks: vi.fn(async () => {}),
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
it('hides private books before grouping and refuses direct reader access without authentication', async () => {
  localStorage.setItem(
    'privacy-navigation-test',
    JSON.stringify({
      version: 1,
      books: { [books[0].id]: 'hidden' },
      credential: { salt: 'a'.repeat(32), hash: 'b'.repeat(64) },
    }),
  );
  history.replaceState(null, '', '/library');
  ensure.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    expect(host.textContent).not.toContain('Book One');
    await act(async () => navigateWeb('/books/' + books[0].id + '/read'));
    expect(host.querySelector('[data-reader]')).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Unlock private books');
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Cancel privacy')!
        .click(),
    );
    expect(location.pathname).toBe('/library');
    expect(ensure).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem('privacy-navigation-test');
  }
});
it('opens a series directly, routes into its reader, and restores the series on browser Back', async () => {
  history.replaceState(null, '', '/series/A%2FB');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    expect(host.querySelector('h1')?.textContent).toBe('A/B');
    const shelf = host.querySelector<HTMLElement>('main.library')!;
    shelf.scrollTop = 240;
    await act(async () =>
      shelf.dispatchEvent(new Event('scroll', { bubbles: true })),
    );
    await act(async () => navigateWeb('/books/' + books[0].id + '/tracking'));
    expect(shelf.scrollTop).toBe(240);
    await act(async () => {
      const popped = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      history.back();
      await popped;
    });
    const link = host.querySelector<HTMLAnchorElement>(
      '[aria-label="Open Book One"]',
    )!;
    expect(link.getAttribute('href')).toBe('/books/' + books[0].id + '/read');
    await act(async () => link.click());
    expect(location.pathname).toBe('/books/' + books[0].id + '/read');
    expect(host.querySelector('[data-reader]')?.textContent).toContain(
      'Book One',
    );
    await act(async () => {
      const popped = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      history.back();
      await popped;
    });
    expect(host.querySelector('h1')?.textContent).toBe('A/B');
    expect(host.querySelector('[data-reader]')).toBeNull();
    expect(host.querySelector<HTMLElement>('main.library')!.scrollTop).toBe(
      240,
    );
    await act(async () => navigateWeb('/books/' + books[1].id + '/read'));
    expect(host.querySelector('[data-reader]')?.textContent).toContain(
      'Book Two',
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    history.replaceState(null, '', '/');
  }
});

it('keeps details-origin removal in browser history and returns deletion to its shelf', async () => {
  const bookId = books[0].id;
  const seriesPath = '/series/A%2FB';
  history.replaceState(null, '', seriesPath);
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const click = async (text: string) =>
    act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === text)!
        .click(),
    );
  try {
    await act(async () => root.render(<App />));
    await act(async () => navigateWeb('/books/' + bookId));
    expect(host.textContent).toContain('Book details');
    await click('Remove from library');
    expect(location.pathname).toBe('/books/' + bookId + '/remove');
    expect(host.textContent).toContain('Remove from library?');

    await act(async () => {
      const popped = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      history.back();
      await popped;
    });
    expect(location.pathname).toBe('/books/' + bookId);
    expect(host.querySelector('.details-intro h3')?.textContent).toBe(
      'Book One',
    );

    await click('Remove from library');
    await act(async () => root.unmount());
    host.replaceChildren();
    root = createRoot(host);
    await act(async () => root.render(<App />));
    expect(location.pathname).toBe('/books/' + bookId + '/remove');
    expect(host.textContent).toContain('Remove from library?');
    await click('Cancel');
    await vi.waitFor(() =>
      expect(location.pathname).toBe('/books/' + bookId),
    );
    expect(host.querySelector('.details-intro h3')?.textContent).toBe(
      'Book One',
    );

    await click('Remove from library');
    await click('Remove from library');
    await vi.waitFor(() => expect(location.pathname).toBe(seriesPath));
    expect(host.querySelector('h1')?.textContent).toBe('A/B');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    history.replaceState(null, '', '/');
  }
});

it('clears empty search in both URL and rendered results', async () => {
  history.replaceState(null, '', '/library?q=no_matching_book');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    expect(host.textContent).toContain('No books found');
    const clear = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear search',
    )!;
    await act(async () => clear.click());
    expect(location.search).toBe('');
    expect(host.textContent).not.toContain('No books found');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    history.replaceState(null, '', '/');
  }
});
it('selects the exact number of books in a grouped series', async () => {
  history.replaceState(null, '', '/library');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Select')!
        .click(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
    );
    expect(
      host.querySelector('[aria-label="Selected books"]')?.textContent,
    ).toContain('2 selected');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
    );
    expect(
      host.querySelector('[aria-label="Selected books"]')?.textContent,
    ).toContain('0 selected');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    history.replaceState(null, '', '/');
  }
});
it('shows one hidden-library heading and returns to the regular shelf', async () => {
  const { credential } = await import('../src/features/privacy/model');
  localStorage.setItem(
    'privacy-navigation-test',
    JSON.stringify({
      version: 1,
      books: { [books[0].id]: 'hidden' },
      credential: await credential('123456'),
    }),
  );
  history.replaceState(null, '', '/library');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Library view options"]',
        )!
        .click(),
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Hidden books')!
        .click(),
    );
    const input = host.querySelector<HTMLInputElement>(
      'input[type="password"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '123456');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    expect([...host.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([
      'Hidden books',
    ]);
    expect(host.querySelector('.shelf-label > span')?.textContent).toBe('1');
    expect(host.textContent).toContain('Book One');
    expect(host.textContent).not.toContain('Book Two');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Back to library"]')!
        .click(),
    );
    expect(host.querySelector('h1')?.textContent).toBe('All books');
    expect(host.textContent).not.toContain('Book One');
    expect(host.textContent).toContain('Book Two');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem('privacy-navigation-test');
    history.replaceState(null, '', '/');
  }
});
