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
