import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ReleaseNotes } from '../src/features/updates/ReleaseNotes';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('formats versions, headings, paragraphs and bullet lists while leaving hostile syntax inert', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <ReleaseNotes
        text={
          '## [0.6.2]\n\nA paragraph.\nContinued.\n\n### Fixed\n- First\n- Second\n\n<script>alert(1)</script> [click](javascript:alert(1))\n![remote](https://evil.test/img)'
        }
      />,
    ),
  );
  expect(host.querySelector('h4')?.textContent).toBe('0.6.2');
  expect(host.querySelectorAll('li')).toHaveLength(2);
  expect(host.textContent).toContain('A paragraph. Continued.');
  expect(host.querySelector('script,img,a,iframe')).toBeNull();
  expect(host.textContent).toContain('<script>alert(1)</script>');
  await act(async () => root.unmount());
});
