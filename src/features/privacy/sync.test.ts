import { beforeEach, expect, it, vi } from 'vitest';
import { emptyPrivacy, readPrivacy } from './model';
import {
  mergePrivacy,
  restorePrivacy,
  sharedPrivacy,
  validatePrivacy,
} from './shared';
import { syncPrivacy } from './sync';
const { call, load } = vi.hoisted(() => ({ call: vi.fn(), load: vi.fn() }));
vi.mock('../sync/transport', () => ({ privacyCall: call }));
vi.mock('../../storage', () => ({
  devicePrivacyKey: () => 'privacy-test',
  loadSync: load,
}));
const id = 'a'.repeat(64),
  other = 'b'.repeat(64);
const credential = { salt: 'a'.repeat(32), hash: 'b'.repeat(64) };
const changed = { salt: 'c'.repeat(32), hash: 'd'.repeat(64) };
const empty = { credential: null, books: {} };
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  load.mockResolvedValue({
    enabled: true,
    account: {
      origin: 'https://books.example',
      username: 'alice',
      sessionId: 'session',
    },
  });
});
it('merges independent edits and never weakens concurrent protection', () => {
  const base = { credential, books: { [id]: 'locked' as const } };
  expect(
    mergePrivacy(
      base,
      { credential, books: {} },
      { credential, books: { [id]: 'hidden', [other]: 'locked' } },
    ).books,
  ).toEqual({ [id]: 'hidden', [other]: 'locked' });
  expect(mergePrivacy(base, { credential, books: {} }, base).books).toEqual({});
});
it('uses the server passcode when both devices changed it and keeps book restrictions', () => {
  expect(
    mergePrivacy(
      empty,
      { credential, books: { [id]: 'hidden' } },
      { credential: changed, books: {} },
    ),
  ).toEqual({ credential: changed, books: { [id]: 'hidden' } });
});
it('restoring a backup preserves the current passcode and strongest book restrictions', () => {
  expect(
    restorePrivacy(
      { ...emptyPrivacy(), credential, books: { [id]: 'hidden' } },
      { credential: changed, books: { [id]: 'locked', [other]: 'hidden' } },
    ),
  ).toEqual({ credential, books: { [id]: 'hidden', [other]: 'hidden' } });
  expect(
    restorePrivacy(emptyPrivacy(), { credential, books: { [id]: 'hidden' } }),
  ).toEqual({ credential, books: { [id]: 'hidden' } });
});
it('validates only portable protection data', () => {
  expect(
    sharedPrivacy({
      ...emptyPrivacy(),
      credential,
      biometrics: true,
      shield: true,
      books: { [id]: 'hidden' },
    }),
  ).toEqual({ credential, books: { [id]: 'hidden' } });
  for (const value of [
    { credential: null, books: { [id]: 'hidden' } },
    { credential, books: { invalid: 'hidden' } },
    { credential, books: [], biometrics: true },
  ])
    expect(() => validatePrivacy(value)).toThrow();
});
it('pulls first, uploads local protection, and keeps changes made during the request', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential,
      books: { [id]: 'hidden' },
    }),
  );
  call.mockImplementationOnce(async () => ({
    revision: 0,
    state: empty,
    accepted: true,
  }));
  call.mockImplementationOnce(async (_account, req) => {
    const state = readPrivacy('privacy-test');
    localStorage.setItem(
      'privacy-test',
      JSON.stringify({
        ...state,
        books: { ...state.books, [other]: 'locked' },
      }),
    );
    return { revision: 1, state: req.state, accepted: true };
  });
  call.mockImplementationOnce(async (_account, req) => ({
    revision: 2,
    state: req.state,
    accepted: true,
  }));
  await syncPrivacy();
  expect(call.mock.calls[0][1].state).toBeNull();
  expect(call.mock.calls[2][1].state.books).toEqual({
    [id]: 'hidden',
    [other]: 'locked',
  });
  expect(readPrivacy('privacy-test').books).toEqual({
    [id]: 'hidden',
    [other]: 'locked',
  });
});
it('preserves local protection on failure and rejects another account before sending it', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential,
      books: { [id]: 'hidden' },
    }),
  );
  call.mockRejectedValue(new Error('offline'));
  await expect(syncPrivacy()).rejects.toThrow('offline');
  expect(readPrivacy('privacy-test').books[id]).toBe('hidden');
  load.mockResolvedValue({
    enabled: true,
    account: {
      origin: 'https://other.example',
      username: 'bob',
      sessionId: 'other',
    },
  });
  await expect(syncPrivacy()).rejects.toThrow('another server account');
  expect(call).toHaveBeenCalledTimes(1);
});
it('does not apply a response after disconnect', async () => {
  call.mockImplementation(async () => {
    load.mockResolvedValue({ enabled: false });
    return {
      revision: 1,
      state: { credential, books: { [id]: 'hidden' } },
      accepted: true,
    };
  });
  await syncPrivacy();
  expect(readPrivacy('privacy-test').credential).toBeUndefined();
});
it('retries a stale write while preserving edits from both devices', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential,
      books: { [id]: 'hidden' },
      sync: {
        account: JSON.stringify(['https://books.example', 'alice']),
        revision: 1,
        baseline: { credential, books: {} },
      },
    }),
  );
  call.mockResolvedValueOnce({
    revision: 1,
    state: { credential, books: {} },
    accepted: true,
  });
  call.mockResolvedValueOnce({
    revision: 2,
    state: { credential, books: { [other]: 'locked' } },
    accepted: false,
  });
  call.mockImplementationOnce(async (_a, req) => ({
    revision: 3,
    state: req.state,
    accepted: true,
  }));
  await syncPrivacy();
  expect(call.mock.calls[2][1]).toEqual({
    revision: 2,
    state: { credential, books: { [id]: 'hidden', [other]: 'locked' } },
  });
  expect(readPrivacy('privacy-test').sync?.revision).toBe(3);
});
it('retains a removed restriction until the server acknowledges it, including a lost response', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential,
      books: {},
      sync: {
        account: JSON.stringify(['https://books.example', 'alice']),
        revision: 1,
        baseline: { credential, books: { [id]: 'hidden' } },
      },
    }),
  );
  call.mockResolvedValueOnce({
    revision: 1,
    state: { credential, books: { [id]: 'hidden' } },
    accepted: true,
  });
  call.mockRejectedValueOnce(new Error('response lost'));
  await expect(syncPrivacy()).rejects.toThrow('response lost');
  expect(readPrivacy('privacy-test').books).toEqual({});
  expect(readPrivacy('privacy-test').sync?.baseline.books[id]).toBe('hidden');
  call.mockResolvedValueOnce({
    revision: 2,
    state: { credential, books: {} },
    accepted: true,
  });
  await syncPrivacy();
  expect(readPrivacy('privacy-test').sync?.baseline.books).toEqual({});
});
it('adopts a remote passcode, disables biometrics, and preserves local device preferences', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential,
      biometrics: true,
      shield: true,
      autoLock: false,
      sync: {
        account: JSON.stringify(['https://books.example', 'alice']),
        revision: 1,
        baseline: { credential, books: {} },
      },
    }),
  );
  call.mockResolvedValue({
    revision: 2,
    state: { credential: changed, books: { [id]: 'hidden' } },
    accepted: true,
  });
  await syncPrivacy();
  expect(readPrivacy('privacy-test')).toMatchObject({
    credential: changed,
    biometrics: false,
    shield: true,
    autoLock: false,
    books: { [id]: 'hidden' },
  });
});
it('does nothing without a connected server', async () => {
  load.mockResolvedValue({ enabled: false });
  await syncPrivacy();
  expect(call).not.toHaveBeenCalled();
  expect(localStorage.getItem('privacy-test')).toBeNull();
});
it('recovers a rolled-back server revision without weakening local restrictions or replacing its passcode', async () => {
  localStorage.setItem(
    'privacy-test',
    JSON.stringify({
      ...emptyPrivacy(),
      credential: changed,
      books: { [id]: 'hidden' },
      sync: {
        account: JSON.stringify(['https://books.example', 'alice']),
        revision: 8,
        baseline: { credential: changed, books: { [id]: 'hidden' } },
      },
    }),
  );
  call.mockResolvedValueOnce({
    revision: 2,
    state: { credential, books: { [other]: 'locked' } },
    accepted: true,
  });
  call.mockImplementationOnce(async (_a, req) => ({
    revision: 3,
    state: req.state,
    accepted: true,
  }));
  await syncPrivacy();
  expect(call.mock.calls[1][1]).toEqual({
    revision: 2,
    state: {
      credential: changed,
      books: { [id]: 'hidden', [other]: 'locked' },
    },
  });
});
