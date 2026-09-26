import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FocalWord } from './FocalWord';

it('fits both sides around the focal letter and restores size when space returns', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actEnvironment = globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  };
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  let width = 200;
  const available = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => width);
  const measured = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('rsvp-word-focal')
        ? 20
        : this.classList.contains('rsvp-word-after')
          ? 390
          : 40;
    });
  try {
    await act(async () =>
      root.render(<FocalWord word="characteristically" size={20} />),
    );
    const word = host.querySelector('.rsvp-word') as HTMLElement;
    expect(word.style.transform).toBe('scale(0.25)');
    expect(word.getAttribute('aria-label')).toBe('characteristically');
    expect(
      Array.from(word.children).every(
        (part) => part.getAttribute('aria-hidden') === 'true',
      ),
    ).toBe(true);
    width = 1000;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(word.style.transform).toBe('scale(1)');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    available.mockRestore();
    measured.mockRestore();
  }
});

it('applies independent RSVP typography and refits after a custom font loads', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const fonts = new EventTarget();
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: fonts,
  });
  let afterWidth = 40;
  const available = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(200);
  const measured = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('rsvp-word-after') ? afterWidth : 20;
    });
  try {
    await act(async () =>
      root.render(
        <FocalWord
          word="reading"
          size={64}
          font="system:Custom Reader"
          focalColor="#123456"
        />,
      ),
    );
    const word = host.querySelector('.rsvp-word') as HTMLElement;
    expect(word.style.fontSize).toBe('64px');
    expect(word.style.fontFamily).toBe('"Custom Reader", Georgia, serif');
    expect(
      (host.querySelector('.rsvp-word-focal') as HTMLElement).style.color,
    ).toBe('rgb(18, 52, 86)');
    expect(word.style.transform).toBe('scale(1)');
    afterWidth = 390;
    await act(async () => fonts.dispatchEvent(new Event('loadingdone')));
    expect(word.style.transform).toBe('scale(0.25)');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    available.mockRestore();
    measured.mockRestore();
    Reflect.deleteProperty(document, 'fonts');
  }
});
