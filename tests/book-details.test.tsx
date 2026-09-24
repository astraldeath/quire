import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';
import { BookDetails } from '../src/features/library/BookDetails';

vi.mock('../src/features/sync/BookServerActions', () => ({
  BookServerActions: () => null,
}));

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

const book: Book = {
  id: 'one',
  title: 'One',
  author: 'Author',
  series: 'Series',
  volume: 1,
  cover: '',
  addedAt: 0,
  local: true,
};

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

it('saves focused metadata edits into the refreshed summary without closing details', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn().mockResolvedValue(undefined),
    remove = vi.fn().mockResolvedValue(undefined),
    close = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(book);
    return (
      <BookDetails
        book={current}
        onClose={close}
        onSave={async (next) => {
          await save(next);
          setCurrent(next);
        }}
        onRemove={remove}
        onRead={() => {}}
        onImport={() => {}}
        onDelete={() => {}}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  const click = async (text: string) =>
    act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === text)!
        .click(),
    );

  expect(host.querySelector('input')).toBeNull();
  await click('Edit details');
  const title = host.querySelector<HTMLInputElement>('input[name="title"]')!;
  expect(document.activeElement).toBe(title);
  expect(
    Array.from(host.querySelectorAll('button')).map(
      (button) => button.textContent,
    ),
  ).not.toEqual(
    expect.arrayContaining([
      'Open book',
      'Remove download',
      'Remove from library',
    ]),
  );
  expect(
    Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save changes',
    )?.disabled,
  ).toBe(true);
  await act(async () => setInput(title, '  Revised title  '));
  await click('Save changes');
  expect(save).toHaveBeenCalledWith({ ...book, title: 'Revised title' });
  expect(host.querySelector('input')).toBeNull();
  expect(host.querySelector('.details-intro h3')?.textContent).toBe(
    'Revised title',
  );
  expect(document.activeElement?.textContent).toBe('Edit details');
  expect(close).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it('guards a changed edit and retains the draft after a failed save', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn().mockRejectedValue(new Error('Disk unavailable'));
  await act(async () =>
    root.render(
      <BookDetails
        book={book}
        onClose={() => {}}
        onSave={save}
        onRemove={async () => {}}
        onRead={() => {}}
        onImport={() => {}}
        onDelete={() => {}}
      />,
    ),
  );
  const click = async (text: string) =>
    act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === text)!
        .click(),
    );

  await click('Edit details');
  const title = host.querySelector<HTMLInputElement>('input[name="title"]')!;
  await act(async () => setInput(title, 'Draft title'));
  await click('Cancel');
  expect(host.textContent).toContain('Discard changes?');
  await click('Keep editing');
  expect(
    host.querySelector<HTMLInputElement>('input[name="title"]')?.value,
  ).toBe('Draft title');
  await click('Save changes');
  expect(host.textContent).toContain('Could not save details.');
  expect(host.textContent).toContain('Disk unavailable');
  expect(
    host.querySelector<HTMLInputElement>('input[name="title"]')?.value,
  ).toBe('Draft title');
  await act(async () => root.unmount());
});

it.each(['success', 'failure'])(
  'freezes submitted metadata and ignores duplicate submits during a deferred save (%s)',
  async (outcome) => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const save = vi.fn((_next: Book) => pending);
    const close = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(book);
      return (
        <BookDetails
          book={current}
          onClose={close}
          onSave={async (next) => {
            await save(next);
            setCurrent(next);
          }}
          onRemove={async () => {}}
          onRead={() => {}}
          onImport={() => {}}
          onDelete={() => {}}
        />
      );
    }
    try {
      await act(async () => root.render(<Harness />));
      await act(async () =>
        [...host.querySelectorAll('button')]
          .find((button) => button.textContent === 'Edit details')!
          .click(),
      );
      const title = host.querySelector<HTMLInputElement>(
        'input[name="title"]',
      )!;
      expect(document.activeElement).toBe(title);
      await act(async () => setInput(title, 'Submitted title'));
      const form = host.querySelector('form')!;
      await act(async () => {
        // Both events arrive before React renders busy state; a ref must gate the mutation.
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      });
      expect(
        [...host.querySelectorAll('input')].every((input) =>
          input.matches(':disabled'),
        ),
      ).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith({ ...book, title: 'Submitted title' });
      expect(host.querySelector('form')).not.toBeNull();
      if (outcome === 'failure') {
        await act(async () => reject(new Error('Disk unavailable')));
        expect(
          host.querySelector<HTMLInputElement>('input[name="title"]')?.value,
        ).toBe('Submitted title');
        expect(
          [...host.querySelectorAll('input')].every(
            (input) => !input.matches(':disabled'),
          ),
        ).toBe(true);
        expect(host.textContent).toContain('Could not save details.');
        // Failure clears the in-flight guard so the same draft can be retried.
        await act(async () =>
          form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          ),
        );
        expect(save).toHaveBeenCalledTimes(2);
      } else {
        await act(async () => resolve());
        expect(host.querySelector('form')).toBeNull();
        expect(host.querySelector('.details-intro h3')?.textContent).toBe(
          'Submitted title',
        );
        expect(document.activeElement?.textContent).toBe('Edit details');
      }
      expect(close).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);

it.each([
  [true, /download it again from your server/i],
  [false, /import the file again/i],
  [undefined, /server copy has not been verified/i],
])(
  'explains device removal for remote availability %s before deleting',
  async (remoteAvailable, consequence) => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const remove = vi.fn(async () => {});
    await act(async () =>
      root.render(
        <BookDetails
          book={book}
          remoteAvailable={remoteAvailable as boolean | undefined}
          onClose={() => {}}
          onSave={async () => {}}
          onRemove={remove}
          onRead={() => {}}
          onImport={() => {}}
          onDelete={() => {}}
        />,
      ),
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Remove download')!
        .click(),
    );
    expect(host.querySelector('.removal')?.textContent).toMatch(consequence);
    expect(remove).not.toHaveBeenCalled();
    await act(async () =>
      [...host.querySelectorAll('.removal button')]
        .find((b) => b.textContent === 'Remove download')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  },
);
