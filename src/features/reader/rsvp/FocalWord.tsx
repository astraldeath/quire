import { useLayoutEffect, useRef } from 'react';
import { splitFocalWord } from './focal';

export function FocalWord({ word, size }: { word: string; size: number }) {
  const container = useRef<HTMLSpanElement>(null);
  const { before, focal, after } = splitFocalWord(word);
  useLayoutEffect(() => {
    const element = container.current!;
    const fit = () => {
      const parts = Array.from(element.children) as HTMLElement[];
      const halfWidth =
        Math.max(parts[0].offsetWidth, parts[2].offsetWidth) +
        parts[1].offsetWidth / 2;
      const scale = halfWidth
        ? Math.min(1, element.clientWidth / (halfWidth * 2))
        : 1;
      element.style.transform = `scale(${scale})`;
    };
    fit();
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(element);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [word, size]);
  return (
    <span
      ref={container}
      className="rsvp-word"
      role="img"
      aria-label={word}
      style={{ fontSize: `clamp(1.5rem, 8vw, ${Math.max(32, size * 2)}px)` }}
    >
      <span aria-hidden="true" className="rsvp-word-before">
        {before}
      </span>
      <span aria-hidden="true" className="rsvp-word-focal">
        {focal}
      </span>
      <span aria-hidden="true" className="rsvp-word-after">
        {after}
      </span>
    </span>
  );
}
