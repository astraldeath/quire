import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Modal } from '../src/components/Modal';
import { useDraftGuard } from '../src/components/useDraftGuard';
import { requestNavigation } from '../src/features/navigation/blockers';
import { navigateWeb } from '../src/features/navigation/routes';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
const closed = vi.fn();
function Editor({ busy = false }: { busy?: boolean }) {
  const [title, setTitle] = useState('Original');
  const [saved, setSaved] = useState('Original');
  const guard = useDraftGuard({ dirty: title !== saved, busy });
  return (
    <>
      <Modal title="Edit details" onClose={() => guard.requestLeave(closed)}>
        <input
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button onClick={() => guard.requestLeave(closed)}>Close</button>
        <button onClick={() => guard.requestLeave(closed)}>Cancel</button>
        <button onClick={() => setSaved(title)}>Save</button>
      </Modal>
      {guard.confirmation}
    </>
  );
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === text,
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
async function edit() {
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'Draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(async () => {
  closed.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  history.replaceState(null, '', '/library');
  await act(async () => root.render(<Editor />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  vi.restoreAllMocks();
});
it('closes a pristine editor immediately', async () => {
  await click('Close');
  expect(closed).toHaveBeenCalledOnce();
  expect(host.querySelectorAll('dialog')).toHaveLength(1);
});
it('returns focus to the editor after cancelling the nested confirmation', async () => {
  await edit();
  const input = host.querySelector('input')!;
  input.focus();
  await click('Close');
  const confirmation = host.querySelectorAll('dialog')[1];
  await act(async () =>
    confirmation.dispatchEvent(
      new Event('cancel', { bubbles: true, cancelable: true }),
    ),
  );
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('Draft');
});
it.each(['Escape', 'backdrop', 'Close', 'Cancel'])(
  'guards dirty %s dismissal and keeps the draft',
  async (method) => {
    await edit();
    if (method === 'Escape')
      await act(async () =>
        host
          .querySelector('dialog')!
          .dispatchEvent(
            new Event('cancel', { bubbles: true, cancelable: true }),
          ),
      );
    else if (method === 'backdrop')
      await act(async () => host.querySelector('dialog')!.click());
    else await click(method);
    expect(closed).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Keep editing');
    expect(host.textContent).toContain('Discard changes');
    await click('Keep editing');
    expect(host.querySelector('input')!.value).toBe('Draft');
    expect(location.pathname).toBe('/library');
    expect(host.querySelectorAll('dialog')).toHaveLength(1);
  },
);
it('keeps only the first transition and resumes a nested navigation exactly once', async () => {
  await edit();
  let first = 0,
    second = 0;
  await act(async () => {
    requestNavigation(() => {
      first++;
      navigateWeb('/settings/backups');
    });
    requestNavigation(() => {
      second++;
    });
  });
  expect(location.pathname).toBe('/library');
  await click('Discard changes');
  expect(first).toBe(1);
  expect(second).toBe(0);
  expect(location.pathname).toBe('/settings/backups');
  expect(host.querySelectorAll('dialog')).toHaveLength(1);
  // Discard authorization cannot leak into a subsequent request.
  await act(async () =>
    requestNavigation(() => {
      second++;
    }),
  );
  expect(second).toBe(0);
  await click('Keep editing');
});
it('discards Close once and stops guarding once saved', async () => {
  await edit();
  await click('Close');
  await click('Discard changes');
  expect(closed).toHaveBeenCalledOnce();
  await click('Save');
  await click('Close');
  expect(closed).toHaveBeenCalledTimes(2);
  expect(host.querySelectorAll('dialog')).toHaveLength(1);
});
it('blocks busy dismissals, including an already open confirmation', async () => {
  await edit();
  await click('Close');
  await act(async () => root.render(<Editor busy />));
  await click('Discard changes');
  expect(closed).not.toHaveBeenCalled();
  await act(async () => root.render(<Editor />));
  await click('Discard changes');
  expect(closed).toHaveBeenCalledOnce();
});
it('guards unload only while dirty and unregisters on unmount', async () => {
  const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };
  expect(unload()).toBe(false);
  await edit();
  expect(unload()).toBe(true);
  await click('Save');
  expect(unload()).toBe(false);
  await edit(); // Saved title is already Draft; edit to another value below.
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'Another draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(unload()).toBe(true);
  await act(async () => root.render(null));
  expect(unload()).toBe(false);
  requestNavigation(closed);
  expect(closed).toHaveBeenCalledOnce();
});
