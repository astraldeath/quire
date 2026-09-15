import { holdFeedback } from '../src/features/library/haptics';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BookOpenButton } from '../src/features/library/BookOpenButton';
import { BookActions } from '../src/features/library/BookActions';
vi.mock('../src/features/library/haptics', () => ({ holdFeedback: vi.fn() }));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.replaceChildren();
});
async function setup() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const open = vi.fn(),
    actions = vi.fn();
  await act(async () =>
    root.render(
      <BookOpenButton label="Book" onOpen={open} onActions={actions}>
        Book
      </BookOpenButton>,
    ),
  );
  return { root, open, actions, button: host.querySelector('button')! };
}
function pointer(button: HTMLElement, type: string, x = 0, y = 0) {
  button.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true }), {
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
    }),
  );
}
it('opens actions on hold and suppresses the release click', async () => {
  vi.useFakeTimers();
  const c = await setup();
  await act(async () => {
    pointer(c.button, 'pointerdown');
    vi.advanceTimersByTime(500);
    pointer(c.button, 'pointerup');
    c.button.click();
  });
  expect(c.actions).toHaveBeenCalledTimes(1);
  expect(holdFeedback).toHaveBeenCalledTimes(1);
  expect(c.open).not.toHaveBeenCalled();
  await act(async () => c.root.unmount());
});
it('cancels the hold when scrolling or cancelling the pointer', async () => {
  vi.useFakeTimers();
  const c = await setup();
  await act(async () => {
    pointer(c.button, 'pointerdown');
    pointer(c.button, 'pointermove', 0, 25);
    vi.advanceTimersByTime(600);
    pointer(c.button, 'pointerdown');
    pointer(c.button, 'pointercancel');
    vi.advanceTimersByTime(600);
  });
  expect(c.actions).not.toHaveBeenCalled();
  expect(holdFeedback).not.toHaveBeenCalled();
  await act(async () => c.root.unmount());
});
it('opens normally on tap and supports right-click and keyboard actions', async () => {
  const c = await setup();
  await act(async () => {
    pointer(c.button, 'pointerdown');
    pointer(c.button, 'pointerup');
    c.button.click();
  });
  expect(c.open).toHaveBeenCalledTimes(1);
  await act(async () =>
    c.button.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    ),
  );
  expect(c.actions).toHaveBeenCalledTimes(1);
  await act(async () =>
    c.button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
        bubbles: true,
      }),
    ),
  );
  expect(c.actions).toHaveBeenCalledTimes(2);
  expect(holdFeedback).not.toHaveBeenCalled();
  await act(async () => c.root.unmount());
});
it('requires explicit group removal confirmation with the number of books', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const remove = vi.fn().mockResolvedValue(undefined);
  const b = {
    id: 'one',
    title: 'One',
    author: '',
    series: 'Series',
    volume: 1,
    cover: '',
    addedAt: 0,
    local: true,
  };
  await act(async () =>
    root.render(
      <BookActions
        entry={{
          key: 'series',
          title: 'Series',
          series: true,
          books: [b, { ...b, id: 'two' }],
        }}
        onClose={() => {}}
        onOpen={() => {}}
        onDetails={() => {}}
        onRemoveDownload={vi.fn()}
        onDelete={remove}
      />,
    ),
  );
  const click = async (text: string) =>
    act(async () =>
      Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent === text)!
        .click(),
    );
  await click('Remove from library');
  expect(remove).not.toHaveBeenCalled();
  expect(host.textContent).toContain('all 2 books');
  await click('Cancel');
  expect(remove).not.toHaveBeenCalled();
  await click('Remove from library');
  await click('Remove 2 books');
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it('offers tracking directly in a non-modal menu and supports dismissal and keyboard navigation', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn(),
    track = vi.fn(),
    details = vi.fn();
  const book = {
    id: 'one',
    title: 'One',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: true,
  };
  await act(async () =>
    root.render(
      <BookActions
        entry={{ key: 'one', title: 'One', series: false, books: [book] }}
        anchor={{ left: 300, top: 200, bottom: 200 }}
        onClose={close}
        onOpen={() => {}}
        onDetails={details}
        onTracking={track}
        onRemoveDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    ),
  );
  try {
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu).toBeTruthy();
    expect(document.querySelector('dialog')).toBeNull();
    const buttons = [...menu.querySelectorAll('button')];
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () =>
      buttons[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(buttons[1]);
    const tracking = buttons.find(
      (button) => button.textContent === 'Tracking',
    )!;
    expect(tracking.getAttribute('role')).toBe('menuitem');
    await act(async () => tracking.click());
    expect(track).toHaveBeenCalledTimes(1);
    expect(details).not.toHaveBeenCalled();
    await act(async () =>
      menu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () =>
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    );
    expect(close).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
});
