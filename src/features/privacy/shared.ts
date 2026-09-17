import type { BookPrivacy, Credential, PrivacyState } from './model';

export interface SharedPrivacy {
  credential: Credential | null;
  books: Record<string, BookPrivacy>;
}
export interface PrivacySyncState {
  account: string;
  revision: number;
  baseline: SharedPrivacy;
}
export const samePrivacy = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.entries(a),
    right = Object.entries(b);
  return (
    left.length === right.length &&
    left.every(
      ([k, v]) =>
        Object.hasOwn(b, k) &&
        samePrivacy(v, (b as Record<string, unknown>)[k]),
    )
  );
};
export const sharedPrivacy = (state: PrivacyState): SharedPrivacy => ({
  credential: state.credential ?? null,
  books: Object.fromEntries(
    Object.entries(state.books).filter(([, v]) => v !== 'normal'),
  ),
});
export function validatePrivacy(value: unknown): SharedPrivacy {
  const fail = () => {
    throw new Error('Invalid private library settings.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const v = value as SharedPrivacy;
  if (
    Object.keys(v).some((k) => !['credential', 'books'].includes(k)) ||
    !v.books ||
    typeof v.books !== 'object' ||
    Array.isArray(v.books) ||
    Object.keys(v.books).length > 10000 ||
    Object.entries(v.books).some(
      ([id, mode]) =>
        !/^[a-f0-9]{64}$/.test(id) || !['locked', 'hidden'].includes(mode),
    )
  )
    return fail();
  if (
    v.credential !== null &&
    (!v.credential ||
      Object.keys(v.credential).some((k) => !['salt', 'hash'].includes(k)) ||
      !/^[a-f0-9]{32}$/.test(v.credential.salt) ||
      !/^[a-f0-9]{64}$/.test(v.credential.hash))
  )
    return fail();
  if (!v.credential && Object.keys(v.books).length) return fail();
  return { credential: v.credential, books: { ...v.books } };
}
/** Three-way merge: independent edits survive; concurrent restrictions never weaken. */
export function mergePrivacy(
  base: SharedPrivacy,
  local: SharedPrivacy,
  remote: SharedPrivacy,
): SharedPrivacy {
  const books: SharedPrivacy['books'] = {};
  const rank = { normal: 0, locked: 1, hidden: 2 };
  for (const id of new Set([
    ...Object.keys(base.books),
    ...Object.keys(local.books),
    ...Object.keys(remote.books),
  ])) {
    const b = base.books[id] ?? 'normal',
      l = local.books[id] ?? 'normal',
      r = remote.books[id] ?? 'normal';
    const mode = l === b ? r : r === b ? l : rank[l] > rank[r] ? l : r;
    if (mode !== 'normal') books[id] = mode;
  }
  return {
    credential: samePrivacy(remote.credential, base.credential)
      ? local.credential
      : remote.credential,
    books,
  };
}
/** Restoring a backup cannot weaken existing restrictions or replace a working passcode. */
export function restorePrivacy(
  current: PrivacyState,
  backup: SharedPrivacy,
): SharedPrivacy {
  const merged = mergePrivacy(
    { credential: null, books: {} },
    backup,
    sharedPrivacy(current),
  );
  return { ...merged, credential: current.credential ?? backup.credential };
}
