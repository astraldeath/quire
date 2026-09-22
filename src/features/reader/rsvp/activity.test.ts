import { describe, it, expect } from 'vitest';
import { RsvpActivity } from './activity';
import { aggregateStatistics, validateActivity } from '../../statistics/model';
describe('RSVP activity', () => {
  it('records only credited playback dwell and deduplicates chapter replay', () => {
    const a = new RsvpActivity('a'.repeat(64), null);
    a.add(240);
    a.complete(3);
    const first = a.flush(100000);
    a.complete(3);
    a.add(120);
    const second = a.flush(200000);
    const records = [...first, ...second].map(validateActivity);
    expect(records.reduce((sum, r) => sum + r.activeMs, 0)).toBe(360);
    expect(records.every((r) => r.words === 0 && r.sampledMs === 0)).toBe(true);
    expect(aggregateStatistics([], records).chapters).toBe(1);
    expect(a.flush(300000)).toEqual([]);
  });
  it('bounds long intervals and preserves nonconsecutive chapter identities', () => {
    const a = new RsvpActivity('a'.repeat(64), 2);
    a.add(610000);
    a.complete(7);
    a.complete(10);
    const records = a.flush(1000000).map(validateActivity);
    expect(records).toHaveLength(3);
    expect(records.reduce((sum, r) => sum + r.activeMs, 0)).toBe(610000);
    expect(aggregateStatistics([], records).chapters).toBe(2);
  });
});
