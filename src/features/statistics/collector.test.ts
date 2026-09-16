import { describe, expect, it } from 'vitest';
import {
  countVisibleWords,
  ReadingCollector,
  type ReadingPage,
} from './collector';

const page = (overrides: Partial<ReadingPage> = {}): ReadingPage => ({
  key: 'a',
  index: 0,
  fraction: 0,
  size: 0.1,
  words: 100,
  chapter: 1001,
  atEnd: false,
  reason: 'page',
  ...overrides,
});
const setup = () => new ReadingCollector('book', 2, 1000000, 0);
describe('reading activity collector', () => {
  it('completes a continuously scrolled chapter without creating speed samples', () => {
    const c = setup();
    c.relocate(page({ size: 0 }), 0);
    c.relocate(
      page({ key: 'b', size: 0, fraction: 0.4, reason: 'scroll' }),
      6000,
    );
    c.relocate(
      page({ key: 'c', size: 0, fraction: 0.8, reason: 'scroll' }),
      12000,
    );
    c.relocate(
      page({
        key: 'd',
        index: 1,
        size: 0,
        chapter: 1002,
        reason: 'anchor',
        forwardIntent: true,
      }),
      15000,
    );
    const record = c.flush(15000)[0];
    expect(record.chapters).toEqual([1001]);
    expect(record.words).toBe(0);
  });
  it('rejects chapter anchor jumps and interrupted scrolling dwell', () => {
    for (const interrupted of [false, true]) {
      const c = setup();
      c.relocate(page({ size: 0 }), 0);
      if (interrupted) {
        c.setAvailable(false, 12000);
        c.setAvailable(true, 14000);
      }
      c.relocate(
        page({
          key: 'b',
          index: 1,
          size: 0,
          chapter: 1002,
          reason: 'anchor',
          forwardIntent: interrupted,
        }),
        15000,
      );
      expect(c.flush(15000)[0].chapters).toEqual([]);
    }
  });
  it('rejects multiple-page skips even in very long chapters', () => {
    const c = setup();
    c.relocate(page({ size: 0.001 }), 0);
    c.relocate(page({ key: 'b', size: 0.001, fraction: 0.005 }), 20000);
    expect(c.flush(20000)[0].words).toBe(0);
  });
  it('does not sample a page interrupted by a dialog or hidden tab', () => {
    const c = setup();
    c.relocate(page(), 0);
    c.setAvailable(false, 10000);
    c.setAvailable(true, 20000);
    c.relocate(page({ key: 'b', fraction: 0.1 }), 40000);
    const result = c.flush(40000)[0];
    expect(result.words).toBe(0);
    expect(result.activeMs).toBe(30000);
  });
  it('counts visible words across spaced and unspaced scripts', () => {
    expect(countVisibleWords('Hello, reader!')).toBe(2);
    expect(countVisibleWords('今天天气很好')).toBeGreaterThan(1);
    expect(countVisibleWords('   ')).toBe(0);
  });
  it('does not treat repeated visibility checks as interaction', () => {
    const c = setup();
    c.relocate(page(), 0);
    for (let now = 30000; now <= 180000; now += 30000)
      c.setAvailable(true, now);
    expect(c.flush(180000).reduce((n, r) => n + r.activeMs, 0)).toBe(120000);
  });
  it('caps idle time and excludes hidden/dialog intervals', () => {
    const c = setup();
    c.relocate(page(), 0);
    expect(c.flush(180000)[0].activeMs).toBe(120000);
    c.setAvailable(false, 180000);
    c.interact(190000);
    expect(c.flush(200000)).toEqual([]);
    c.setAvailable(true, 200000);
    c.interact(200000);
    expect(c.flush(210000)[0].activeMs).toBe(10000);
  });
  it('samples a single forward page once and proportions checkpointed dwell', () => {
    const c = setup();
    c.relocate(page(), 0);
    expect(c.flush(10000)[0].words).toBe(0);
    c.relocate(page({ key: 'b', fraction: 0.1 }), 20000);
    const record = c.flush(20000)[0];
    expect(record.words).toBe(50);
    expect(record.sampledMs).toBe(10000);
    expect(c.flush(20000)).toEqual([]);
  });
  it('excludes jumps, backwards pages and reflows from speed and completion', () => {
    for (const next of [
      page({ key: 'b', fraction: 0.5, chapter: 1002 }),
      page({ key: 'b', fraction: -0.1 }),
      page({ key: 'b', fraction: 0.1, reason: 'anchor' }),
    ]) {
      const c = setup();
      c.relocate(page(), 0);
      c.relocate(next, 20000);
      const record = c.flush(20000)[0];
      expect(record.words).toBe(0);
      expect(record.chapters).toEqual([]);
    }
  });
  it('records only the chapter actually crossed after reading, including large numbers', () => {
    const c = setup();
    c.relocate(page({ fraction: 0.9 }), 0);
    c.relocate(
      page({
        key: 'b',
        index: 1,
        fraction: 0,
        chapter: 1002,
        reason: 'anchor',
        forwardIntent: true,
      }),
      20000,
    );
    expect(c.flush(20000)[0].chapters).toEqual([1001]);
  });
  it('requires final-page dwell and records finish only once', () => {
    const c = setup();
    c.relocate(page({ atEnd: true }), 0);
    expect(c.flush(2000)[0].finished).toBe(false);
    const record = c.flush(12000)[0];
    expect(record.finished).toBe(true);
    expect(record.volume).toBe(2);
    expect(c.flush(24000)[0].finished).toBe(false);
  });
  it('splits stalled checkpoints into bounded immutable records', () => {
    const c = setup();
    c.relocate(page(), 0);
    const records = c.flush(900000);
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r.endedAt - r.startedAt).toBeLessThanOrEqual(300000);
      expect(r.activeMs).toBeLessThanOrEqual(r.endedAt - r.startedAt);
    }
    expect(records.reduce((n, r) => n + r.activeMs, 0)).toBe(120000);
  });
});
