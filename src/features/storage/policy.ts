import type { Book } from '../../domain/models';
import type { Account } from '../sync/model';

const recentAccess = new Map<string, number>();
export function touchBook(id: string) {
  recentAccess.set(id, Date.now());
}

export interface StoragePolicy {
  autoUpload: boolean;
  offload: boolean;
  finishedOnly: boolean;
  days: number;
  maxMB: number;
  pinned: string[];
  accessed: Record<string, number>;
}
export const storageDefaults: StoragePolicy = {
  autoUpload: false,
  offload: false,
  finishedOnly: true,
  days: 30,
  maxMB: 0,
  pinned: [],
  accessed: {},
};
export const owner = (a: Account) => `${a.username}@${a.origin}`;
const key = (a: Account) => `quire-storage-policy:${owner(a)}`;
export function readPolicy(a: Account): StoragePolicy {
  try {
    const p = JSON.parse(localStorage.getItem(key(a)) ?? '{}');
    return {
      autoUpload: p.autoUpload === true,
      offload: p.offload === true,
      finishedOnly: p.finishedOnly !== false,
      days:
        Number.isInteger(p.days) && p.days >= 1 && p.days <= 3650 ? p.days : 30,
      maxMB:
        Number.isInteger(p.maxMB) && p.maxMB >= 0 && p.maxMB <= 1048576
          ? p.maxMB
          : 0,
      pinned: Array.isArray(p.pinned)
        ? p.pinned.filter((id: unknown) => typeof id === 'string')
        : [],
      accessed: p.accessed && typeof p.accessed === 'object' ? p.accessed : {},
    };
  } catch {
    return { ...storageDefaults };
  }
}
export function writePolicy(a: Account, patch: Partial<StoragePolicy>) {
  localStorage.setItem(key(a), JSON.stringify({ ...readPolicy(a), ...patch }));
  window.dispatchEvent(new Event('quire-storage-policy'));
}
export function eligible(
  book: Book,
  policy: StoragePolicy,
  active: string | null,
  now = Date.now(),
) {
  const last = Math.max(
    book.addedAt,
    recentAccess.get(book.id) ?? 0,
    book.position?.updatedAt ?? 0,
    Number(policy.accessed[book.id]) || 0,
  );
  return (
    policy.offload &&
    book.local &&
    book.id !== active &&
    !policy.pinned.includes(book.id) &&
    (!policy.finishedOnly || (book.position?.fraction ?? 0) >= 0.999) &&
    now - last >= policy.days * 86400000
  );
}
