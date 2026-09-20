import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ActionPopover,
  type ActionAnchor,
} from '../src/components/ActionPopover';
import { ActionMenuItem } from '../src/components/ActionMenuItem';
import { positionMenu } from '../src/components/menuPosition';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('keeps an above-anchor submenu on its original side', () => {
  const origin = { left: 200, top: 600, bottom: 644 };
  const viewport = { left: 8, top: 8, right: 392, bottom: 792 };
  const first = positionMenu({
    origin,
    viewport,
    size: { width: 280, height: 360 },
  });
  const next = positionMenu({
    origin,
    viewport,
    size: { width: 280, height: 100 },
    side: first.side,
  });
  expect(first.side).toBe('above');
  expect(next.side).toBe('above');
  expect(next.top + 100).toBeLessThanOrEqual(origin.top);
  expect(next.left + 280).toBeLessThanOrEqual(viewport.right);
});

it('clamps a below-anchor menu to the visual viewport', () => {
  expect(
    positionMenu({
      origin: { left: 370, top: 20, bottom: 44 },
      viewport: { left: 8, top: 8, right: 392, bottom: 792 },
      size: { width: 160, height: 100 },
    }),
  ).toEqual({ left: 232, top: 48, side: 'below' });
});

it('navigates visible enabled menu items across pages and restores the original trigger', async () => {
  function Harness() {
    const [anchor, setAnchor] = useState<ActionAnchor>();
    const [page, setPage] = useState<'main' | 'privacy'>('main');
    return (
      <>
        <button
          onClick={(event) =>
            setAnchor({
              left: 40,
              top: 40,
              bottom: 64,
              element: event.currentTarget,
            })
          }
        >
          Actions
        </button>
        {anchor && (
          <ActionPopover
            title={page === 'main' ? 'Book actions' : 'Privacy'}
            pageKey={page}
            initialItem={page === 'main' ? 'privacy' : 'normal'}
            anchor={anchor}
            onClose={() => setAnchor(undefined)}
          >
            {page === 'main' ? (
              <>
                <ActionMenuItem menuId="open">Open</ActionMenuItem>
                <ActionMenuItem menuId="disabled" disabled>
                  Unavailable
                </ActionMenuItem>
                <ActionMenuItem
                  menuId="privacy"
                  onClick={() => setPage('privacy')}
                >
                  Privacy
                </ActionMenuItem>
              </>
            ) : (
              <>
                <ActionMenuItem menuId="back" onClick={() => setPage('main')}>
                  Back
                </ActionMenuItem>
                <ActionMenuItem menuId="normal">Normal</ActionMenuItem>
                <ActionMenuItem menuId="hidden" hidden>
                  Hidden choice
                </ActionMenuItem>
                <ActionMenuItem menuId="locked">Locked</ActionMenuItem>
              </>
            )}
          </ActionPopover>
        )}
      </>
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  await act(async () => trigger.click());
  expect((document.activeElement as HTMLElement).dataset.menuId).toBe(
    'privacy',
  );
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect((document.activeElement as HTMLElement).dataset.menuId).toBe('normal');
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  );
  expect((document.activeElement as HTMLElement).dataset.menuId).toBe('locked');
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    ),
  );
  expect((document.activeElement as HTMLElement).dataset.menuId).toBe('back');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect((document.activeElement as HTMLElement).dataset.menuId).toBe(
    'privacy',
  );
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(trigger);
  await act(async () => root.unmount());
});
