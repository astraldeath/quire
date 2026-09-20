import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryActions } from '../src/features/server/LibraryActions';
import { navigateWeb, useWebPath } from '../src/features/navigation/routes';
const request = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock('../src/features/sync/transport', () => ({ accountRequest: request }));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://example.test',
  username: 'admin',
  sessionId: 'current',
};
const library = { id: 'collection', name: 'Original name' };
const onChange = vi.fn(async () => {});
let host: HTMLDivElement, root: Root;
const showModal = HTMLDialogElement.prototype.showModal;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    this.querySelector<HTMLButtonElement>('button')?.focus();
  };
  request.mockReset();
  request.mockResolvedValue(undefined);
  onChange.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (showModal) HTMLDialogElement.prototype.showModal = showModal;
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});
const renameDialog = () =>
  host.querySelector<HTMLDialogElement>('dialog[aria-label="Rename library"]')!;
const confirmation = () =>
  host.querySelector<HTMLDialogElement>(
    'dialog[aria-label="Discard changes?"]',
  );
function button(label: string, scope: ParentNode = host) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  )!;
}
async function click(label: string, scope: ParentNode = host) {
  await act(async () => button(label, scope).click());
}
async function edit(value: string) {
  const input = renameDialog().querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <LibraryActions
        account={account}
        library={library}
        onChange={onChange}
      />,
    ),
  );
}
async function dismiss(kind: string) {
  if (kind === 'Close' || kind === 'Cancel')
    await click(kind === 'Close' ? 'Close dialog' : 'Cancel', renameDialog());
  else
    await act(async () => {
      const dialog = renameDialog();
      if (kind === 'Escape')
        dialog.dispatchEvent(
          new Event('cancel', { bubbles: false, cancelable: true }),
        );
      else dialog.click();
    });
}
it('focuses the library name after opening the native dialog', async () => {
  await render();
  await click('Rename');
  expect(document.activeElement).toBe(renameDialog().querySelector('input'));
});
it.each(['Close', 'Cancel', 'Escape', 'backdrop'])(
  'guards a changed rename on %s and keeps the original baseline',
  async (kind) => {
    await render();
    await click('Rename');
    expect(button('Save name').disabled).toBe(true);
    await edit('Edited name');
    await dismiss(kind);
    expect(confirmation()).not.toBeNull();
    expect(request).not.toHaveBeenCalled();
    await click('Keep editing', confirmation()!);
    expect(renameDialog().querySelector('input')!.value).toBe('Edited name');
    await dismiss(kind);
    await click('Discard changes', confirmation()!);
    expect(renameDialog()).toBeNull();
    expect(request).not.toHaveBeenCalled();
    await click('Rename');
    expect(renameDialog().querySelector('input')!.value).toBe('Original name');
    expect(button('Save name').disabled).toBe(true);
  },
);
it('guards browser Back, keeps the route and draft, then discards to the original destination once', async () => {
  function Routed() {
    const path = useWebPath();
    return path.startsWith('/admin/libraries') ? (
      <LibraryActions account={account} library={library} onChange={onChange} />
    ) : (
      <p>Library</p>
    );
  }
  await act(async () => {
    navigateWeb('/library');
    navigateWeb('/admin/libraries?library=collection');
    root.render(<Routed />);
  });
  await click('Rename');
  await edit('Edited name');
  await act(async () => {
    history.back();
    await vi.waitFor(() => expect(confirmation()).not.toBeNull());
  });
  expect(location.pathname + location.search).toBe(
    '/admin/libraries?library=collection',
  );
  await click('Keep editing', confirmation()!);
  expect(renameDialog().querySelector('input')!.value).toBe('Edited name');
  const length = history.length;
  await act(async () => {
    history.back();
    await vi.waitFor(() => expect(confirmation()).not.toBeNull());
  });
  await click('Discard changes', confirmation()!);
  await act(async () => {
    await vi.waitFor(() => expect(location.pathname).toBe('/library'));
  });
  expect(host.textContent).toBe('Library');
  expect(history.length).toBe(length);
  expect(request).not.toHaveBeenCalled();
});
it('blocks dismissal during save and clears the dirty blocker after success', async () => {
  let resolve!: () => void;
  request.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  await act(async () => navigateWeb('/admin/libraries?library=collection'));
  await render();
  await click('Rename');
  await edit('Saved name');
  await click('Save name');
  expect(renameDialog().querySelector('input')!.disabled).toBe(true);
  await dismiss('Close');
  expect(renameDialog()).not.toBeNull();
  expect(confirmation()).toBeNull();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    account,
    '/v1/admin/libraries/collection',
    { name: 'Saved name' },
    'PATCH',
  );
  await act(async () => resolve());
  expect(renameDialog()).toBeNull();
  expect(onChange).toHaveBeenCalledOnce();
  await act(async () => navigateWeb('/admin/accounts'));
  expect(location.pathname).toBe('/admin/accounts');
  expect(confirmation()).toBeNull();
});
