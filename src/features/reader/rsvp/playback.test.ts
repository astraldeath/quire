import { afterEach, describe, it, expect, vi } from 'vitest';
import { RsvpPlayback, normalizeWpm, type RsvpState } from './playback';
import { tokenizeRsvp } from './tokens';
const tokens = (text: string) =>
  tokenizeRsvp(new DOMParser().parseFromString(`<p>${text}</p>`, 'text/html'));
afterEach(() => vi.useRealTimers());
describe('RSVP playback', () => {
  it('advances one word, restarts dwell after pause, and ends after final dwell', () => {
    vi.useFakeTimers();
    let state!: RsvpState;
    const end = vi.fn();
    const p = new RsvpPlayback(
      tokens('one two'),
      250,
      false,
      (s) => (state = s),
      end,
    );
    p.play();
    p.play();
    vi.advanceTimersByTime(240);
    expect(state.index).toBe(1);
    p.pause();
    vi.advanceTimersByTime(60000);
    expect(state.index).toBe(1);
    expect(end).not.toHaveBeenCalled();
    p.play();
    vi.advanceTimersByTime(239);
    expect(end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(state.playing).toBe(false);
    p.dispose();
  });
  it('takes maximum punctuation/paragraph delay and applies live configuration', () => {
    vi.useFakeTimers();
    let state!: RsvpState;
    const p = new RsvpPlayback(
      tokens('one, two. three'),
      250,
      true,
      (s) => (state = s),
      vi.fn(),
    );
    p.play();
    vi.advanceTimersByTime(359);
    expect(state.index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(state.index).toBe(1);
    p.configure(1000, true);
    vi.advanceTimersByTime(119);
    expect(state.index).toBe(1);
    vi.advanceTimersByTime(1);
    expect(state.index).toBe(2);
    p.dispose();
  });
  it('rewinds sentence, pauses, and invalidates callbacks on disposal', () => {
    vi.useFakeTimers();
    let state!: RsvpState;
    const p = new RsvpPlayback(
      tokens('One two. Three four.'),
      1000,
      false,
      (s) => (state = s),
      vi.fn(),
    );
    p.play();
    vi.advanceTimersByTime(180);
    p.rewindSentence();
    expect(state).toMatchObject({ index: 2, playing: false });
    p.rewindSentence();
    expect(state.index).toBe(0);
    p.play();
    p.dispose();
    vi.advanceTimersByTime(10000);
    expect(state.index).toBe(0);
  });
  it('pauses a suspended timer instead of bursting through unread tokens', () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let state!: RsvpState;
    const p = new RsvpPlayback(
      tokens('one two three'),
      250,
      false,
      (s) => (state = s),
      vi.fn(),
    );
    p.play();
    now = 60000;
    vi.advanceTimersByTime(240);
    expect(state).toMatchObject({ index: 0, playing: false });
    p.dispose();
    vi.restoreAllMocks();
  });
  it('normalizes persisted speeds and supports range endpoints', () => {
    expect([undefined, NaN, Infinity, -1].map(normalizeWpm)).toEqual([
      250, 250, 250, 60,
    ]);
    expect(normalizeWpm(1001)).toBe(1000);
    expect(normalizeWpm(60)).toBe(60);
  });
});
it('credits partial dwell on pause but excludes a long suspended timer', () => {
  vi.useFakeTimers();
  const time = vi.fn();
  const p = new RsvpPlayback(
    tokens('One two'),
    250,
    false,
    vi.fn(),
    vi.fn(),
    0,
    undefined,
    time,
  );
  p.play();
  vi.advanceTimersByTime(100);
  p.pause();
  expect(time).toHaveBeenLastCalledWith(100);
  vi.advanceTimersByTime(60000);
  expect(time).toHaveBeenCalledTimes(1);
  p.dispose();
});

it('combines custom punctuation and long-word pauses without multiplying them together', () => {
  vi.useFakeTimers();
  let state!: RsvpState;
  const credited: number[] = [];
  const dwelled: number[] = [];
  const p = new RsvpPlayback(
    tokens('lengthyword, next'),
    300,
    true,
    (s) => (state = s),
    vi.fn(),
    0,
    (_index, ms) => dwelled.push(ms),
    (ms) => credited.push(ms),
    {
      punctuationMultiplier: 2,
      longWordPauses: true,
      longWordMultiplier: 2.5,
      longWordLength: 8,
    },
  );
  p.play();
  vi.advanceTimersByTime(499);
  expect(state.index).toBe(0);
  vi.advanceTimersByTime(1);
  expect(state.index).toBe(1);
  expect(dwelled).toEqual([500]);
  expect(credited).toEqual([500]);
  p.dispose();
});

it('credits elapsed time once when live pause settings restart the current word', () => {
  vi.useFakeTimers();
  let state!: RsvpState;
  const credited: number[] = [];
  const p = new RsvpPlayback(
    tokens('lengthyword next'),
    300,
    false,
    (s) => (state = s),
    vi.fn(),
    0,
    undefined,
    (ms) => credited.push(ms),
  );
  p.play();
  vi.advanceTimersByTime(100);
  p.configure(300, false, {
    longWordPauses: true,
    longWordMultiplier: 2,
    longWordLength: 8,
  });
  vi.advanceTimersByTime(399);
  expect(state.index).toBe(0);
  vi.advanceTimersByTime(1);
  expect(state.index).toBe(1);
  expect(credited).toEqual([100, 400]);
  p.pause();
  vi.advanceTimersByTime(60000);
  expect(credited.reduce((sum, ms) => sum + ms, 0)).toBe(500);
  p.dispose();
});

it('counts letters rather than surrounding punctuation for long-word pauses', () => {
  vi.useFakeTimers();
  let state!: RsvpState;
  const p = new RsvpPlayback(
    tokens('“word!!!” next'),
    300,
    false,
    (s) => (state = s),
    vi.fn(),
    0,
    undefined,
    undefined,
    { longWordPauses: true, longWordMultiplier: 3, longWordLength: 8 },
  );
  p.play();
  vi.advanceTimersByTime(200);
  expect(state.index).toBe(1);
  p.dispose();
});

it.each([
  ['word, next', true, 2, 400],
  ['word. next', true, 2, 600],
  ['word', true, 2, 800],
  ['word. next', true, 0, 200],
  ['word. next', false, 3, 200],
  ['word. next', true, NaN, 400],
] as const)(
  'uses bounded custom punctuation timing for %s',
  (text, pauses, strength, milliseconds) => {
    vi.useFakeTimers();
    const dwelled: number[] = [];
    const p = new RsvpPlayback(
      tokens(text),
      300,
      pauses,
      vi.fn(),
      vi.fn(),
      0,
      (_index, ms) => dwelled.push(ms),
      undefined,
      { punctuationMultiplier: strength },
    );
    p.play();
    vi.advanceTimersByTime(milliseconds - 1);
    expect(dwelled).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(dwelled).toEqual([milliseconds]);
    p.dispose();
  },
);
