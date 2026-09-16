import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  credential,
  verifyPasscode,
  visibleBook,
  canAccess,
  emptyPrivacy,
} from './model';
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});
describe('device book privacy', () => {
  it('hashes passcodes with independent salts and verifies only the right code', async () => {
    const a = await credential('123456');
    const b = await credential('123456');
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPasscode('123456', a)).toBe(true);
    expect(await verifyPasscode('654321', a)).toBe(false);
    await expect(credential('123')).rejects.toThrow();
  });
  it('keeps hidden books out of ordinary views even in an unlocked session', () => {
    const state = {
      ...emptyPrivacy(),
      books: { a: 'hidden' as const, b: 'locked' as const },
    };
    expect(visibleBook(state, 'a', false, true)).toBe(false);
    expect(visibleBook(state, 'a', true, false)).toBe(false);
    expect(visibleBook(state, 'a', true, true)).toBe(true);
    expect(visibleBook(state, 'b', false, false)).toBe(true);
    expect(canAccess(state, 'b', false)).toBe(false);
    expect(canAccess(state, 'a', true)).toBe(true);
  });
});
