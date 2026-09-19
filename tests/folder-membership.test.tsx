import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FolderMembershipDialog } from '../src/features/library/FolderMembershipDialog';

vi.mock('../src/components/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
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
  expect(checkbox('Favorites').indeterminate).toBe(true);
  await act(async () => checkbox('Later').click());
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith({ Later: true });
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
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, ' Favorites / Novels ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith({
    Fiction: false,
    'Favorites/Novels': true,
  });
});
