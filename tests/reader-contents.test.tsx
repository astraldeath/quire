import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Contents } from '../src/features/reader/Contents';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const items = [
  {
    label: 'Anthology',
    href: 'one',
    subitems: [
      {
        label: 'Volume 1',
        href: 'one',
        subitems: [
          { label: 'Chapter 1', href: 'one' },
          { label: 'Chapter 2', href: 'two' },
        ],
      },
      {
        label: 'Volume 2',
        href: 'three',
        subitems: [{ label: 'Chapter 3', href: 'three' }],
      },
    ],
  },
  { label: 'Appendix', href: 'appendix' },
];

it('expands the active branch and toggles groups independently of navigation', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    go = vi.fn();
  const render = async (active: string) =>
    act(async () =>
      root.render(<Contents items={items} active={active} go={go} />),
    );
  const click = async (name: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
    );
    expect(button, name).toBeTruthy();
    await act(async () => button!.click());
  };
  try {
    await render('two');
    expect(host.textContent).toContain('Chapter 2');
    expect(host.textContent).not.toContain('Chapter 3');
    expect(host.querySelector('[aria-current="location"]')?.textContent).toBe(
      'Chapter 2',
    );
    await click('Collapse Volume 1');
    expect(host.textContent).not.toContain('Chapter 2');
    expect(go).not.toHaveBeenCalled();
    await render('two');
    expect(host.textContent).not.toContain('Chapter 2');
    await click('Expand Volume 1');
    await click('Chapter 1');
    expect(go).toHaveBeenCalledWith('one');
    await click('Volume 1');
    expect(go).toHaveBeenCalledTimes(2);
    await click('Collapse Anthology');
    expect(host.textContent).not.toContain('Volume 1');
    await render('three');
    expect(host.textContent).toContain('Chapter 3');
    expect(host.querySelector('[aria-current="location"]')?.textContent).toBe(
      'Chapter 3',
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('highlights the deepest duplicate target and supports groups without a destination', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    go = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Contents
          items={[
            ...items,
            {
              label: 'Extras',
              href: '',
              subitems: [{ label: 'Afterword', href: 'after' }],
            },
          ]}
          active="one"
          go={go}
        />,
      ),
    );
    expect(host.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
    expect(host.querySelector('[aria-current="location"]')?.textContent).toBe(
      'Chapter 1',
    );
    const extra = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Extras',
    )!;
    expect(extra.getAttribute('aria-expanded')).toBe('false');
    await act(async () => extra.click());
    expect(host.textContent).toContain('Afterword');
    expect(go).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
