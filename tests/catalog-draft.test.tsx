import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { requestNavigation } from '../src/features/navigation/blockers';
vi.mock('../src/components/Modal', () => ({
  Modal: ({ title, children, onClose }: any) => (
    <section>
      <h2>{title}</h2>
      <button onClick={onClose}>Close dialog</button>
      {children}
    </section>
  ),
}));
import { SourceDialog } from '../src/features/opds/SourceDialog';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it.each(['cancel', 'modal', 'navigation'])(
  'guards catalog authentication changes on %s dismissal',
  async (path) => {
    const host = document.createElement('div'),
      root = createRoot(host),
      close = vi.fn();
    await act(async () =>
      root.render(
        <SourceDialog context={{} as any} onClose={close} onSaved={() => {}} />,
      ),
    );
    const click = async (text: string) =>
      act(async () =>
        [...host.querySelectorAll('button')]
          .find((b) => b.textContent === text)!
          .click(),
      );
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    if (path === 'cancel') await click('Cancel');
    else if (path === 'modal') await click('Close dialog');
    else await act(async () => requestNavigation(close));
    expect(close).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Discard changes?');
    await click('Keep editing');
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,
    ).toBe(true);
    await click('Cancel');
    await click('Discard changes');
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  },
);

it('closes an untouched catalog immediately', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    close = vi.fn();
  await act(async () =>
    root.render(
      <SourceDialog context={{} as any} onClose={close} onSaved={() => {}} />,
    ),
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Cancel')!
      .click(),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('Discard changes?');
  await act(async () => root.unmount());
});
