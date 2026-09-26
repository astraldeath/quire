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

it('retains mounted adjacent images and their URLs when turning back', async () => {
  await render();
  const current = host.querySelector('[data-page="2"] img');
  const ahead = host.querySelector('[data-page="3"] img');
  expect(ahead).not.toBeNull();
  const url = current!.getAttribute('src');
  await act(async () => navigation.current!.navigate('next'));
  await act(async () => navigation.current!.navigate('prev'));
  expect(host.querySelector('[data-page="2"] img')).toBe(current);
  expect(current!.getAttribute('src')).toBe(url);
  expect(revoked).not.toContain(url);
  expect(host.querySelectorAll('img').length).toBeLessThanOrEqual(3);
});

it('bounds webtoon image resources even when many placeholders intersect', async () => {
  const many = Array.from({ length: 80 }, (_, index) => ({
    name: `${index}.png`,
    blob: () => new Blob(['image']),
  }));
  await act(async () =>
    root.render(
      <ComicPages
        pages={many}
        preferences={{ ...defaults.reader, comicMode: 'webtoon' }}
        navigationRef={navigation}
        onPosition={position}
        onCenterTap={center}
        onNavigate={() => {}}
      />,
    ),
  );
  await act(async () => {
    for (const callback of observed.values()) callback(true);
  });
  expect(host.querySelectorAll('img').length).toBeLessThanOrEqual(12);
  await act(async () => navigation.current!.navigate('70.png'));
  expect(host.querySelectorAll('img').length).toBeLessThanOrEqual(12);
  expect(host.querySelector('[data-page="70"] img')).not.toBeNull();
  expect(host.querySelector('[data-page="0"] img')).toBeNull();
  await act(async () => root.unmount());
  expect(new Set(revoked)).toEqual(new Set(created));
});

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
    navigation.current!.navigate('4.png');
  });
  expect(signal.aborted).toBe(true);
  expect(created).toHaveLength(3);
  await act(async () => {
    finish(new Blob(['stale']));
  });
  expect(created).toHaveLength(3);
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 5');
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
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 1');
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
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 3');
  await render({ comicMode: 'double' });
  expect(
    [
      ...host.querySelectorAll<HTMLImageElement>(
        '.comic-image:not([aria-hidden]) img',
      ),
    ].map((image) => image.alt),
  ).toEqual(['Page 2', 'Page 3']);
  await render();
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 3');
});
it('releases old page images through rapid navigation and closing', async () => {
  await render();
  await act(async () => {
    navigation.current!.navigate('next');
    navigation.current!.navigate('next');
    navigation.current!.navigate('next');
  });
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 6');
  expect(position.mock.lastCall?.[0].cfi).toBe('epubcfi(/6/12)');
  await act(async () => root.unmount());
  expect(new Set(revoked)).toEqual(new Set(created));
});
it('creates webtoon image URLs only near the viewport and releases them when distant', async () => {
  await render({ comicMode: 'webtoon' });
  expect(host.querySelectorAll('[data-page]')).toHaveLength(8);
  expect(created).toHaveLength(3);
  const slot = host.querySelector('[data-page="2"]')!;
  await act(async () => observed.get(slot)!(true));
  const current = slot.querySelector('img');
  expect(current?.alt).toBe('Page 3');
  expect(created).toHaveLength(3);
  await act(async () => observed.get(slot)!(false));
  expect(slot.querySelector('img')).toBe(current);
  await act(async () => navigation.current!.navigate('7.png'));
  expect(slot.querySelector('img')).toBeNull();
  expect(revoked).toHaveLength(3);
});

it('keeps the loaded spread visible until a distant destination is ready', async () => {
  await render();
  const image = host.querySelector('[data-page="2"] img')!;
  await act(async () => image.dispatchEvent(new Event('load')));
  await act(async () => navigation.current!.navigate('7.png'));
  expect(host.querySelector('.comic-image:not([aria-hidden]) img')).toBe(image);
  const next = host.querySelector('[data-page="7"] img')!;
  await act(async () => next.dispatchEvent(new Event('load')));
  expect(host.querySelector('.comic-image:not([aria-hidden]) img')).toBe(next);
  expect(host.querySelectorAll('img')).toHaveLength(2);
});

it('preserves decoded images through spread and direction preferences without recording prefetch progress', async () => {
  await render();
  const image = host.querySelector('[data-page="2"] img')!;
  const decode = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(image, 'decode', { value: decode });
  await act(async () => image.dispatchEvent(new Event('load')));
  const calls = position.mock.calls.length;
  await act(async () =>
    host.querySelector('[data-page="3"] img')!.dispatchEvent(new Event('load')),
  );
  expect(position).toHaveBeenCalledTimes(calls);
  await render({ comicMode: 'double', comicDirection: 'rtl' });
  await render({ comicMode: 'single' });
  expect(host.querySelector('[data-page="2"] img')).toBe(image);
  expect(decode).toHaveBeenCalledTimes(1);
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
  expect(
    host.querySelector<HTMLImageElement>('.comic-image:not([aria-hidden]) img')
      ?.alt,
  ).toBe('Page 6');
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

function pointer(type: string, x: number, y = 100, primary = true) {
  const element = host.querySelector<HTMLElement>('.comic-pages')!;
  element.setPointerCapture = () => {};
  element.getBoundingClientRect = () => ({ left: 0, width: 400 }) as DOMRect;
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    isPrimary: { value: primary },
    pointerId: { value: primary ? 1 : 2 },
  });
  element.dispatchEvent(event);
}
async function decodeImages() {
  await act(async () => {
    for (const image of host.querySelectorAll('img'))
      image.dispatchEvent(new Event('load'));
  });
}
it.each(['ltr', 'rtl'] as const)(
  'follows the finger and commits a decoded %s spread without replacing images',
  async (direction) => {
    vi.useFakeTimers();
    await render({ comicMode: 'double', comicDirection: direction });
    await decodeImages();
    const current = host.querySelector<HTMLElement>('[data-page="2"]')!;
    const next = host.querySelector<HTMLElement>('[data-page="3"]')!;
    const image = next.querySelector('img');
    const dx = direction === 'ltr' ? -150 : 150;
    await act(async () => pointer('pointerdown', 200));
    await act(async () => pointer('pointermove', 200 + dx));
    expect(current.style.transform).toBe(`translateX(${dx}px)`);
    expect(next.style.transform).toBe(`translateX(${dx}px)`);
    expect(position.mock.lastCall?.[0].section).toBe('Page 3');
    await act(async () => pointer('pointerup', 200 + dx));
    await act(async () => vi.advanceTimersByTime(300));
    expect(position.mock.lastCall?.[0].section).toBe('Page 4');
    expect(next.querySelector('img')).toBe(image);
    expect(next.getAttribute('aria-hidden')).toBeNull();
    vi.useRealTimers();
  },
);
it('settles short drags back and cancels when a pointer is interrupted', async () => {
  vi.useFakeTimers();
  await render();
  await decodeImages();
  for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    await act(async () => pointer('pointerdown', 200));
    await act(async () => pointer('pointermove', 170));
    expect(
      host.querySelector<HTMLElement>('[data-page="2"]')!.style.transform,
    ).toBe('translateX(-30px)');
    await act(async () => pointer(release, 170));
    await act(async () => vi.advanceTimersByTime(300));
    expect(position.mock.lastCall?.[0].section).toBe('Page 3');
    expect(
      host.querySelector<HTMLElement>('[data-page="2"]')!.style.transform,
    ).toBe('translateX(0px)');
  }
  expect(center).not.toHaveBeenCalled();
  vi.useRealTimers();
});
it.each([
  { animated: false },
  { swipeToTurn: false },
  { comicMode: 'webtoon' as const },
])('keeps direct motion disabled for %j', async (preferences) => {
  await render(preferences);
  await decodeImages();
  await act(async () => pointer('pointerdown', 300));
  await act(async () => pointer('pointermove', 100));
  expect(
    host.querySelector<HTMLElement>('[data-page="2"]')!.style.transform,
  ).not.toBe('translateX(-200px)');
});
it('honors reduced motion and prevents zoomed or selected gestures from navigating', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  await render();
  await decodeImages();
  await act(async () => pointer('pointerdown', 300));
  await act(async () => pointer('pointermove', 100));
  expect(
    host.querySelector<HTMLElement>('[data-page="2"]')!.style.transform,
  ).toBe('translateX(0px)');
  await act(async () => pointer('pointerup', 100));
  expect(position.mock.lastCall?.[0].section).toBe('Page 4');
  vi.stubGlobal('visualViewport', { scale: 2 });
  await act(async () => gesture(300, 100));
  expect(position.mock.lastCall?.[0].section).toBe('Page 4');
});

it('keeps unreadied neighboring pages from replacing the decoded page during a swipe', async () => {
  await render();
  const current = host.querySelector('[data-page="2"] img')!;
  await act(async () => current.dispatchEvent(new Event('load')));
  await act(async () => pointer('pointerdown', 300));
  await act(async () => pointer('pointermove', 100));
  await act(async () => pointer('pointerup', 100));
  expect(host.querySelector('.comic-image:not([aria-hidden]) img')).toBe(
    current,
  );
  const next = host.querySelector('[data-page="3"] img')!;
  await act(async () => next.dispatchEvent(new Event('load')));
  expect(host.querySelector('.comic-image:not([aria-hidden]) img')).toBe(next);
});
it('bounces at the final spread and cancels a drag when selection or a second pointer appears', async () => {
  vi.useFakeTimers();
  await render({ comicMode: 'double' }, 7);
  await act(async () => navigation.current!.navigate('5.png'));
  await decodeImages();
  for (const interruption of ['boundary', 'selection', 'pinch']) {
    await act(async () => pointer('pointerdown', 300));
    await act(async () => pointer('pointermove', 150));
    let selected;
    if (interruption === 'selection') {
      selected = vi
        .spyOn(window, 'getSelection')
        .mockReturnValue({ toString: () => 'selected' } as Selection);
      await act(async () => pointer('pointermove', 100));
    }
    if (interruption === 'pinch')
      await act(async () => pointer('pointerdown', 100, 100, false));
    await act(async () => pointer('pointerup', 100));
    await act(async () => vi.advanceTimersByTime(300));
    expect(position.mock.lastCall?.[0].section).toBe('Page 6');
    expect(
      host.querySelector<HTMLElement>('[data-page="5"]')!.style.transform,
    ).toBe('translateX(0px)');
    selected?.mockRestore();
  }
  vi.useRealTimers();
});
it('honors custom comic tap actions and inactive zones', async () => {
  await render({
    tapZones: {
      left: 'controls',
      center: 'next',
      right: 'none',
      sideWidth: 30,
    },
  });
  await act(async () => gesture(30, 30));
  expect(center).toHaveBeenCalledOnce();
  await act(async () => gesture(370, 370));
  expect(position.mock.lastCall?.[0].section).toBe('Page 3');
  await act(async () => gesture(200, 200));
  expect(position.mock.lastCall?.[0].section).toBe('Page 4');
});

it('cancels an active drag when text selection appears or the reading mode changes', async () => {
  vi.useFakeTimers();
  await render();
  await decodeImages();
  await act(async () => pointer('pointerdown', 300));
  await act(async () => pointer('pointermove', 100));
  const selected = vi
    .spyOn(window, 'getSelection')
    .mockReturnValue({ toString: () => 'selection' } as Selection);
  await act(async () => pointer('pointerup', 100));
  await act(async () => vi.advanceTimersByTime(300));
  expect(position.mock.lastCall?.[0].section).toBe('Page 3');
  selected.mockRestore();
  await act(async () => pointer('pointerdown', 300));
  await act(async () => pointer('pointermove', 100));
  await render({ comicMode: 'double' });
  await act(async () => pointer('pointerup', 100));
  await act(async () => vi.advanceTimersByTime(300));
  expect(position.mock.lastCall?.[0].section).toBe('Page 3');
  expect(
    host.querySelector<HTMLElement>('[data-page="2"]')!.style.transform,
  ).toBe('translateX(0px)');
  vi.useRealTimers();
});
