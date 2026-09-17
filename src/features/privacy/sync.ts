import { devicePrivacyKey, loadSync } from '../../storage';
import { privacyCall } from '../sync/transport';
import { readPrivacy, type PrivacyState } from './model';
import {
  mergePrivacy,
  samePrivacy,
  sharedPrivacy,
  validatePrivacy,
  type SharedPrivacy,
} from './shared';

export const privacyChanged = 'quire-privacy-changed';
export const privacyReceived = 'quire-privacy-received';

export async function syncPrivacy(): Promise<void> {
  const initial = await loadSync();
  if (!initial.enabled || !initial.account) return;
  const account = initial.account;
  const owner = JSON.stringify([account.origin, account.username]);
  const key = devicePrivacyKey();
  let state = readPrivacy(key);
  if (state.sync?.account !== owner) {
    if (state.sync && state.credential)
      throw new Error(
        'Private books are linked to another server account. Reconnect that account to sync this library.',
      );
    state = {
      ...state,
      sync: {
        account: owner,
        revision: 0,
        baseline: { credential: null, books: {} },
      },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }
  const stillCurrent = async () => {
    const latest = await loadSync();
    return (
      devicePrivacyKey() === key &&
      latest.enabled &&
      latest.account?.origin === account.origin &&
      latest.account?.username === account.username &&
      latest.account?.sessionId === account.sessionId
    );
  };
  // Always pull before publishing on a newly connected device.
  let proposed: SharedPrivacy | null = null;
  let credentialConflict = false;
  for (let attempts = 0; attempts < 10; attempts++) {
    if (!(await stillCurrent())) return;
    const sent = readPrivacy(key);
    if (sent.sync?.account !== owner) return;
    const response = (await privacyCall(account, {
      revision: sent.sync.revision,
      state: proposed,
    })) as { revision?: unknown; state?: unknown; accepted?: unknown } | null;
    if (!(await stillCurrent())) return;
    if (
      !response ||
      !Number.isSafeInteger(response.revision) ||
      (response.revision as number) < 0 ||
      (proposed !== null &&
        (response.revision as number) < sent.sync.revision) ||
      typeof response.accepted !== 'boolean'
    )
      throw new Error('Invalid private library sync response.');
    const remote = validatePrivacy(response.state);
    const current = readPrivacy(key);
    if (current.sync?.account !== owner) return;
    const rollback = (response.revision as number) < sent.sync.revision;
    const base = rollback
      ? { credential: null, books: {} }
      : proposed && response.accepted
        ? proposed
        : sent.sync.baseline;
    const local = sharedPrivacy(current);
    credentialConflict ||= !!(
      !rollback &&
      local.credential &&
      remote.credential &&
      !samePrivacy(local.credential, remote.credential) &&
      !samePrivacy(local.credential, base.credential) &&
      !samePrivacy(remote.credential, base.credential)
    );
    const merged = mergePrivacy(base, local, remote);
    if (rollback && local.credential) merged.credential = local.credential;
    const changed = !samePrivacy(local, merged);
    const newCredential = !samePrivacy(local.credential, merged.credential);
    const next: PrivacyState = {
      ...current,
      credential: merged.credential ?? undefined,
      books: merged.books,
      ...(newCredential ? { biometrics: false, failures: 0, retryAt: 0 } : {}),
      sync: {
        account: owner,
        revision: response.revision as number,
        baseline: remote,
      },
    };
    // Protection and the acknowledged baseline persist together; failed requests never clear edits.
    localStorage.setItem(key, JSON.stringify(next));
    if (changed)
      window.dispatchEvent(
        new CustomEvent(privacyReceived, { detail: { changed } }),
      );
    if (samePrivacy(merged, remote)) {
      if (credentialConflict)
        throw new Error(
          'This account already has a different private-library passcode. Use the server passcode; book restrictions were preserved.',
        );
      return;
    }
    proposed = merged;
  }
  throw new Error(
    'Private library changed on another device. Sync again to finish.',
  );
}
