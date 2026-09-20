import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ExportBookAction } from '../src/features/library/ExportBookAction';
vi.mock('../src/features/library/epub-export', async (original) => ({
  ...(await original<object>()),
  exportEpub: vi.fn(async () => {
    throw new Error('disk');
  }),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('local export recovery refers to device storage', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <ExportBookAction
        book={{
          id: 'b',
          title: 'Book',
          author: '',
          series: '',
          volume: null,
          cover: '',
          local: true,
          addedAt: 1,
        }}
        onClose={() => {}}
      />,
    ),
  );
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toContain('device storage');
  expect(host.textContent).not.toContain('connection');
  await act(async () => root.unmount());
  host.remove();
});
