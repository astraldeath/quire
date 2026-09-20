import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { defaults, type Preferences } from '../src/domain/models';
import { LibraryControls } from '../src/features/library/LibraryControls';
import { SelectionToolbar } from '../src/features/library/SelectionToolbar';
import { ViewOptions } from '../src/features/library/ViewOptions';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};

afterEach(() => document.body.replaceChildren());

async function click(text: string) {
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === text)!
      .click(),
  );
}

it('uses radio choices for immediate filters and closes only with Done', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const filter = vi.fn();
  await act(async () =>
    root.render(
      <LibraryControls
        preferences={defaults}
        onChange={() => {}}
        status="all"
        availability="all"
        onFilter={filter}
        series={false}
        selecting={false}
        onSelect={() => {}}
      />,
    ),
  );
  await click('Filters');
  const reading = document.querySelector<HTMLInputElement>(
    'input[type="radio"][value="reading"]',
  )!;
  expect(reading.getAttribute('role')).toBeNull();
  await act(async () => reading.click());
  expect(filter).toHaveBeenCalledWith('status', 'reading');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click('Done');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe(
    'Filter books',
  );
  await act(async () => root.unmount());
});

it('shares precise view controls without rounding the saved cover size', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [preferences, setPreferences] = useState<Preferences>(defaults);
    return <ViewOptions preferences={preferences} onChange={setPreferences} />;
  }
  await act(async () => root.render(<Harness />));
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect({
    value: range.value,
    min: range.min,
    max: range.max,
    step: range.step,
  }).toEqual({
    value: '156',
    min: '110',
    max: '210',
    step: '1',
  });
  expect(host.querySelector('output')?.className).toBe('sr-only');
  expect(host.textContent).toContain('Smaller');
  expect(host.textContent).toContain('Larger');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(range, '157');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(
    host.querySelector<HTMLInputElement>('input[type="range"]')?.value,
  ).toBe('157');
  await act(async () => root.unmount());
});

it('describes the active sort and resets a newly selected field to its natural direction', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [preferences, setPreferences] = useState<Preferences>({
      ...defaults,
      sort: 'title',
      sortDirection: 'desc',
    });
    return (
      <LibraryControls
        preferences={preferences}
        onChange={setPreferences}
        status="all"
        availability="all"
        onFilter={() => {}}
        series={false}
        selecting={false}
        onSelect={() => {}}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Sort books"]',
  )!;
  const description = () =>
    document.getElementById(trigger.getAttribute('aria-describedby')!)
      ?.textContent;
  expect(description()).toContain('Title, descending');
  await act(async () => trigger.click());
  const added = document.querySelector<HTMLInputElement>(
    'input[type="radio"][value="added"]',
  )!;
  await act(async () => added.click());
  expect(
    document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="desc"]',
    )?.checked,
  ).toBe(true);
  expect(description()).toContain('Date added, descending');
  await act(async () => root.unmount());
});

it('keeps selection compact until books are selected and retains every batch action in More actions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    onFolders: vi.fn(),
    onDownload: vi.fn(),
    onMarkFinished: vi.fn(),
    onMarkUnread: vi.fn(),
    onRemove: vi.fn(),
  };
  function Harness() {
    const [count, setCount] = useState(0);
    return (
      <SelectionToolbar
        selectedIds={Array.from({ length: count }, (_, index) => String(index))}
        totalEligible={3}
        busy={false}
        onSelectAll={() => setCount(count === 3 ? 0 : 3)}
        onDone={() => {}}
        {...actions}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toContain('0 selected');
  expect(host.textContent).toContain('Select all');
  expect(host.textContent).toContain('Done');
  expect(host.textContent).not.toContain('Folders');
  expect(host.textContent).not.toContain('Download');
  await click('Select all');
  expect(host.textContent).toContain('3 selected');
  expect(host.textContent).toContain('Folders');
  await click('More actions');
  expect(document.body.textContent).toContain('Download');
  expect(document.body.textContent).toContain('Mark finished');
  expect(document.body.textContent).toContain('Mark unread');
  expect(document.body.textContent).toContain('Privacy');
  expect(document.body.textContent).toContain('Remove');
  expect(host.textContent).toContain('3 selected');
  await act(async () => root.unmount());
});
