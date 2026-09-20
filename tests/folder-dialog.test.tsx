import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FolderDialog } from '../src/features/library/FolderDialog';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const showModal = HTMLDialogElement.prototype.showModal;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
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
async function render(
  props: Partial<ComponentProps<typeof FolderDialog>> = {},
) {
  const onSave = vi.fn(async (_path: string) => {});
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <FolderDialog
        paths={['Fiction', 'Fiction/Mystery']}
        initial="Fiction"
        onSave={onSave}
        onClose={onClose}
        {...props}
      />,
    ),
  );
  return { onSave, onClose };
}
function button(label: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label') === label,
  );
  expect(result, `button ${label}`).toBeTruthy();
  return result!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function select(value: string) {
  await act(async () => {
    const field = host.querySelector('select')!;
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('moves to an existing folder or back to the library root', async () => {
  const { onSave, onClose } = await render();
  expect(host.querySelector('select')!.value).toBe('Fiction');
  await select('');
  await click('Move');
  expect(onSave).toHaveBeenCalledWith('');
  expect(onClose).toHaveBeenCalledOnce();
});

it('creates a normalized nested destination under the selected parent', async () => {
  const { onSave } = await render();
  await click('New folder');
  await enter(host.querySelector('input')!, '  New / More  ');
  await click('Move');
  expect(onSave).toHaveBeenCalledWith('Fiction/New/More');
});

it('can leave new-folder entry and select an existing destination', async () => {
  const { onSave } = await render();
  await click('New folder');
  await click('Move');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'Enter a folder name.',
  );
  expect(onSave).not.toHaveBeenCalled();
  await click('Use existing folder');
  expect(host.querySelector('input')).toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await select('Fiction/Mystery');
  await click('Move');
  expect(onSave).toHaveBeenCalledWith('Fiction/Mystery');
});

it('rejects empty and unsafe rename paths, then accepts a corrected path', async () => {
  const { onSave, onClose } = await render({ rename: true });
  expect(host.querySelector('dialog')?.getAttribute('aria-label')).toBe(
    'Rename folder',
  );
  expect(host.querySelector('select')).toBeNull();
  const input = host.querySelector('input')!;
  for (const value of [' ', '../Elsewhere', 'Fiction//Mystery']) {
    await enter(input, value);
    await click('Rename');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  }
  await enter(input, '  Books / Mystery ');
  await click('Rename');
  expect(onSave).toHaveBeenCalledWith('Books/Mystery');
  expect(onClose).toHaveBeenCalledOnce();
});

it('blocks duplicate saves and dismissal while pending, then permits retry after failure', async () => {
  let reject!: (reason: unknown) => void;
  const save = vi
    .fn<(path: string) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectSave) => {
          reject = rejectSave;
        }),
    )
    .mockResolvedValue(undefined);
  const { onClose } = await render({ onSave: save });
  await act(async () => {
    const form = host.querySelector('form')!;
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  expect(save).toHaveBeenCalledOnce();
  expect(host.querySelector('select')?.disabled).toBe(true);
  expect(button('New folder').disabled).toBe(true);
  expect(button('Saving…').disabled).toBe(true);
  await click('Close dialog');
  await act(async () =>
    host
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
  );
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => reject(new Error('Storage is full.')));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'Storage is full.',
  );
  expect(host.querySelector('select')?.disabled).toBe(false);
  await click('Move');
  expect(save).toHaveBeenCalledTimes(2);
  expect(onClose).toHaveBeenCalledOnce();
});

it('guards a changed folder name and confirmation actions never submit the form', async () => {
  const { onSave, onClose } = await render({ rename: true });
  await enter(host.querySelector('input')!, 'Changed');
  await click('Cancel');
  expect(onClose).not.toHaveBeenCalled();
  const keep = button('Keep editing');
  const discard = button('Discard changes');
  expect(keep.getAttribute('type')).toBe('button');
  expect(discard.getAttribute('type')).toBe('button');
  await act(async () => keep.click());
  expect(onSave).not.toHaveBeenCalled();
  await click('Cancel');
  await act(async () => button('Discard changes').click());
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
