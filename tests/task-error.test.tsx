import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { TaskError } from '../src/components/TaskError';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('renders safe details literally and retries only the supplied task', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let retries = 0;
  try {
    await act(async () =>
      root.render(
        <TaskError
          summary="Could not save details."
          detail="<script>alert('x')</script>"
          onRetry={() => retries++}
        />,
      ),
    );
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('details')?.textContent).toContain(
      "<script>alert('x')</script>",
    );
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not save details.',
    );
    await act(async () => host.querySelector('button')!.click());
    expect(retries).toBe(1);
    await act(async () =>
      root.render(
        <TaskError
          summary="Could not save details."
          detail="   "
          busy
          onRetry={() => retries++}
        />,
      ),
    );
    expect(host.querySelector('details')).toBeNull();
    await act(async () => host.querySelector('button')!.click());
    expect(retries).toBe(1);
    await act(async () =>
      root.render(<TaskError summary="Could not save details." detail="" />),
    );
    expect(host.querySelector('button')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
