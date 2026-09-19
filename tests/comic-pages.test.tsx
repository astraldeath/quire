import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  ComicPages,
  type ComicNavigation,
} from '../src/features/reader/ComicPages';
import { defaults, type ReaderPreferences } from '../src/domain/models';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let observed: Map<Element, (visible: boolean) => void>;
const pages = Array.from({ length: 8 }, (_, index) => ({
  name: `${index}.png`,
  blob: () => new Blob(['image']),
}));
const navigation = createRef<ComicNavigation>();
const position = vi.fn();
const center = vi.fn();
let created: string[], revoked: string[];
beforeEach(() => {
  observed = new Map();
  created = [];
  revoked = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private elements: Element[] = [];
      constructor(private callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        this.elements.push(element);
        observed.set(element, (visible) =>
          this.callback(
            [{ isIntersecting: visible } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        );
      }
      disconnect() {
        this.elements.forEach((element) => observed.delete(element));
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:comic-${created.length}`;
    created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    revoked.push(url);
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  position.mockClear();
  center.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(preferences: Partial<ReaderPreferences> = {}, count = 8) {
  await act(async () =>
    root.render(
      <ComicPages
        pages={count === 8 ? pages : pages.slice(0, count)}
        position={{
          cfi: 'epubcfi(/6/6)',
          fraction: 0,
          section: '',
          updatedAt: 0,
        }}
        preferences={{ ...defaults.reader, ...preferences }}
        navigationRef={navigation}
        onPosition={position}
        onCenterTap={center}
        onNavigate={() => {}}
      />,
    ),
  );
}

it('cancels pending page loads on navigation without creating stale object URLs', async () => {
  let finish!: (blob: Blob) => void;
  let signal!: AbortSignal;
  const delayed = pages.map((page, index) =>
    index === 0
      ? {
          name: page.name,
          blob: (request?: AbortSignal) => {
            signal = request!;
            return new Promise<Blob>((resolve) => {
              finish = resolve;
            });
          },
        }
      : page,
  );
  await act(async () =>
    root.render(
      <ComicPages
        pages={delayed}
        preferences={defaults.reader}
        navigationRef={navigation}
        onPosition={position}
        onCenterTap={center}
        onNavigate={() => {}}
      />,
    ),
  );
  expect(created).toHaveLength(0);
  await act(async () => {
    navigation.current!.navigate('next');
  });
  expect(signal.aborted).toBe(true);
  expect(created).toHaveLength(1);
  await act(async () => {
    finish(new Blob(['stale']));
  });
  expect(created).toHaveLength(1);
  expect(host.querySelector('img')?.alt).toBe('Page 2');
});

it('shows asynchronous extraction failures and retries them', async () => {
  const blob = vi
    .fn()
    .mockRejectedValueOnce(new Error('Bad image'))
    .mockResolvedValue(new Blob(['image']));
  await act(async () =>
    root.render(
      <ComicPages
        pages={[{ name: '1.png', blob }]}
        preferences={defaults.reader}
        navigationRef={navigation}
        onPosition={position}
        onCenterTap={center}
        onNavigate={() => {}}
      />,
    ),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'could not load',
  );
  await act(async () => {
    host.querySelector('button')!.click();
  });
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(host.querySelector('img')?.alt).toBe('Page 1');
  expect(blob).toHaveBeenCalledTimes(2);
});
function gesture(start: number, end: number) {
  const element = host.querySelector<HTMLElement>('.comic-pages')!;
  element.setPointerCapture = () => {};
  element.getBoundingClientRect = () => ({ left: 0, width: 400 }) as DOMRect;
  for (const [type, x] of [
    ['pointerdown', start],
    ['pointerup', end],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: 100,
    });
    Object.defineProperties(event, {
      isPrimary: { value: true },
      pointerId: { value: 1 },
    });
    element.dispatchEvent(event);
  }
}
it('keeps the exact selected page through double and single mode changes', async () => {
  await render();
  expect(host.querySelector('img')?.alt).toBe('Page 3');
  await render({ comicMode: 'double' });
  expect([...host.querySelectorAll('img')].map((image) => image.alt)).toEqual([
    'Page 2',
    'Page 3',
  ]);
  await render();
  expect(host.querySelector('img')?.alt).toBe('Page 3');
});
it('releases old page images through rapid navigation and closing', async () => {
  await render();
  await act(async () => {
    navigation.current!.navigate('next');
    navigation.current!.navigate('next');
    navigation.current!.navigate('next');
  });
  expect(host.querySelector('img')?.alt).toBe('Page 6');
  expect(position.mock.lastCall?.[0].cfi).toBe('epubcfi(/6/12)');
  await act(async () => root.unmount());
  expect(new Set(revoked)).toEqual(new Set(created));
});
it('creates webtoon image URLs only near the viewport and releases them when distant', async () => {
  await render({ comicMode: 'webtoon' });
  expect(host.querySelectorAll('[data-page]')).toHaveLength(8);
  expect(created).toHaveLength(0);
  const slot = host.querySelector('[data-page="2"]')!;
  await act(async () => observed.get(slot)!(true));
  expect(host.querySelector('img')?.alt).toBe('Page 3');
  expect(created).toHaveLength(1);
  await act(async () => observed.get(slot)!(false));
  expect(host.querySelector('img')).toBeNull();
  expect(revoked).toEqual(created);
});
it('reverses taps and swipes for RTL and keeps their switches independent', async () => {
  await render({ comicDirection: 'rtl', tapToTurn: false });
  await act(async () => gesture(350, 350));
  expect(center).toHaveBeenCalledOnce();
  expect(position.mock.lastCall?.[0].section).toBe('Page 3');
  await act(async () => gesture(50, 300));
  expect(position.mock.lastCall?.[0].section).toBe('Page 4');
  await render({ comicDirection: 'rtl', swipeToTurn: false });
  await act(async () => gesture(50, 300));
  expect(position.mock.lastCall?.[0].section).toBe('Page 4');
  await act(async () => gesture(30, 30));
  expect(position.mock.lastCall?.[0].section).toBe('Page 5');
});
it('marks a final double-page spread complete without losing its selected page locator', async () => {
  await render({ comicMode: 'double' }, 7);
  await act(async () => navigation.current!.navigate('3.png'));
  expect(position.mock.lastCall?.[0].fraction).toBeLessThan(1);
  await act(async () => navigation.current!.navigate('next'));
  expect(position.mock.lastCall?.[0].fraction).toBe(1);
  expect(position.mock.lastCall?.[0].cfi).toBe('epubcfi(/6/12)');
});
it('anchors the selected webtoon page when a preceding image decodes to a different height', async () => {
  await render({ comicMode: 'webtoon' });
  const container = host.querySelector<HTMLElement>('.comic-pages')!;
  const preceding = host.querySelector<HTMLElement>('[data-page="1"]')!;
  const anchor = host.querySelector<HTMLElement>('[data-page="2"]')!;
  Object.defineProperty(anchor, 'offsetTop', {
    get: () =>
      Number.parseFloat(preceding.style.aspectRatio) === 1 ? 1700 : 2000,
  });
  container.scrollTop = 2000;
  await act(async () => observed.get(preceding)!(true));
  const image = preceding.querySelector('img')!;
  Object.defineProperties(image, {
    naturalWidth: { value: 1000 },
    naturalHeight: { value: 1000 },
  });
  await act(async () => image.dispatchEvent(new Event('load')));
  expect(container.scrollTop).toBe(1700);
  expect(position.mock.lastCall?.[0].cfi).toBe('epubcfi(/6/6)');
});
it('does not turn pages after a second pointer joins a pinch', async () => {
  await render();
  const element = host.querySelector<HTMLElement>('.comic-pages')!;
  element.setPointerCapture = () => {};
  await act(async () => {
    for (const [type, primary, x, id] of [
      ['pointerdown', true, 300, 1],
      ['pointerdown', false, 200, 2],
      ['pointerup', true, 100, 1],
    ] as const) {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: 100,
      });
      Object.defineProperties(event, {
        isPrimary: { value: primary },
        pointerId: { value: id },
      });
      element.dispatchEvent(event);
    }
  });
  expect(position.mock.lastCall?.[0].section).toBe('Page 3');
});
it('advances a tall webtoon image by a viewport step without skipping to the next image', async () => {
  await render({ comicMode: 'webtoon' });
  const container = host.querySelector<HTMLElement>('.comic-pages')!;
  Object.defineProperties(container, {
    clientHeight: { value: 600 },
    scrollHeight: { value: 6000 },
  });
  const nextPage = host.querySelector<HTMLElement>('[data-page="3"]')!;
  Object.defineProperty(nextPage, 'offsetTop', { value: 3000 });
  container.scrollTop = 200;
  await act(async () => navigation.current!.navigate('next'));
  expect(container.scrollTop).toBe(710);
  await act(async () => navigation.current!.navigate('prev'));
  expect(container.scrollTop).toBe(200);
  await act(async () => navigation.current!.navigate('3.png'));
  expect(container.scrollTop).toBe(3000);
});
it('opens bookmarks created by the previous Foliate comic renderer', async () => {
  await render();
  await act(async () => navigation.current!.navigate('epubcfi(/6/12!/4/2)'));
  expect(host.querySelector('img')?.alt).toBe('Page 6');
});
it('finishes a tall final webtoon image only at its bottom, keeping its page locator', async () => {
  vi.useFakeTimers();
  await render({ comicMode: 'webtoon' });
  await act(async () => vi.advanceTimersByTime(20));
  const container = host.querySelector<HTMLElement>('.comic-pages')!;
  Object.defineProperties(container, {
    clientHeight: { value: 600 },
    scrollHeight: { value: 4000 },
  });
  for (const slot of container.querySelectorAll<HTMLElement>('[data-page]')) {
    Object.defineProperty(slot, 'offsetTop', {
      value: Number(slot.dataset.page) === 7 ? 2000 : 0,
    });
  }
  const last = host.querySelector<HTMLElement>('[data-page="7"]')!;
  await act(async () => observed.get(last)!(true));
  const image = last.querySelector('img')!;
  Object.defineProperties(image, {
    naturalWidth: { value: 700 },
    naturalHeight: { value: 1000 },
  });
  await act(async () => image.dispatchEvent(new Event('load')));
  await act(async () => navigation.current!.navigate('7.png'));
  await act(async () => vi.advanceTimersByTime(20));
  expect(position.mock.lastCall?.[0].cfi).toBe('epubcfi(/6/16)');
  expect(position.mock.lastCall?.[0].fraction).toBeLessThan(1);
  container.scrollTop = 3400;
  await act(async () => {
    container.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
  expect(position.mock.lastCall?.[0]).toMatchObject({
    cfi: 'epubcfi(/6/16)',
    fraction: 1,
  });
  container.scrollTop = 2500;
  await act(async () => {
    container.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
  expect(position.mock.lastCall?.[0].fraction).toBeLessThan(1);
  vi.useRealTimers();
});
