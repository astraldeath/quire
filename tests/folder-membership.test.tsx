import { act, useLayoutEffect, useRef, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FolderMembershipDialog } from '../src/features/library/FolderMembershipDialog';

vi.mock('../src/components/Modal', () => ({
  Modal: ({
    title,
    children,
    initialFocus,
    focusKey,
  }: {
    title: string;
    children: React.ReactNode;
    initialFocus?: RefObject<HTMLElement | null>;
    focusKey?: string;
  }) => (
    <TestModal title={title} initialFocus={initialFocus} focusKey={focusKey}>
      {children}
    </TestModal>
  ),
}));
function TestModal({
  title,
  children,
  initialFocus,
  focusKey,
}: {
  title: string;
  children: React.ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  focusKey?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    dialog.current?.focus();
    initialFocus?.current?.focus();
  }, [focusKey, initialFocus]);
  return (
    <section ref={dialog} role="dialog" tabIndex={-1}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
});

it('keeps mixed memberships unchanged unless toggled and can add another folder', async () => {
  const save = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <FolderMembershipDialog
        paths={['Fiction', 'Favorites', 'Later']}
        memberships={[['Fiction', 'Favorites'], ['Fiction']]}
        onSave={save}
        onClose={() => {}}
      />,
    ),
  );
  const checkbox = (name: string) =>
    host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
  expect(checkbox('Fiction').checked).toBe(true);
  expect(checkbox('Fiction').type).toBe('checkbox');
  expect(checkbox('Favorites').indeterminate).toBe(true);
  expect(
    [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Save'),
    )?.disabled,
  ).toBe(true);
  await act(async () => checkbox('Later').click());
  expect(
    [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Save'),
    )?.disabled,
  ).toBe(false);
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith({ Later: true });
});

it('keeps selected folders while a nested search filters them from view', async () => {
  const save = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <FolderMembershipDialog
        paths={['Fiction', 'Fiction/Mystery', 'Reference/History']}
        memberships={[['Fiction']]}
        context="1 selected book"
        parent="Fiction"
        onSave={save}
        onClose={() => {}}
      />,
    ),
  );
  expect(host.querySelector('h2')?.textContent).toBe(
    'Folders for 1 selected book',
  );
  const search = host.querySelector<HTMLInputElement>(
    'input[aria-label="Search folders"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(search, 'Mystery');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('input[aria-label="Fiction"]')).toBeNull();
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('input[aria-label="Fiction/Mystery"]')!
      .click(),
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(search, '');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="Fiction"]')!
      .checked,
  ).toBe(true);
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="Fiction/Mystery"]')!
      .checked,
  ).toBe(true);
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith({ 'Fiction/Mystery': true });
});

it('removes membership without removing the book and adds normalized new paths', async () => {
  const save = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <FolderMembershipDialog
        paths={['Fiction']}
        memberships={[['Fiction']]}
        onSave={save}
        onClose={() => {}}
      />,
    ),
  );
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'New folder')!
      .click(),
  );
  await act(async () => {
    const parent = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Parent"]',
    )!;
    parent.value = 'Fiction';
    parent.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Folder name"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, ' Novels ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith({
    Fiction: false,
    'Fiction/Novels': true,
  });
});

it('focuses folder search when the picker has many paths', async () => {
  await act(async () =>
    root.render(
      <FolderMembershipDialog
        paths={Array.from({ length: 9 }, (_, index) => `Folder ${index + 1}`)}
        memberships={[[]]}
        onSave={async () => {}}
        onClose={() => {}}
      />,
    ),
  );
  expect(document.activeElement).toBe(
    host.querySelector('input[aria-label="Search folders"]'),
  );
});

it('creates the first folder directly without a parent or search detour', async () => {
  const save = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <FolderMembershipDialog
        paths={[]}
        memberships={[[]]}
        onSave={save}
        onClose={() => {}}
      />,
    ),
  );
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Folder name"]',
  );
  expect(input).not.toBeNull();
  expect(host.querySelector('input[type="search"]')).toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, ' Novels ');
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Create and add')!
      .click(),
  );
  expect(save).toHaveBeenCalledWith({ Novels: true });
});
