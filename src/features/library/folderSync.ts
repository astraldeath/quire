import { folderCatalogTransaction, loadSync } from '../../storage';
import { folderCall, supportsFolderCatalog } from '../sync/transport';
import {
  emptyFolderCatalog,
  mergeFolderCatalog,
  validateFolderCatalog,
  type FolderCatalog,
} from './folderCatalog';

export class FolderCatalogUnavailable extends Error {
  constructor() {
    super('Update Quire Server to sync folders. Book sync is available.');
  }
}
let running: Promise<void> | undefined;
export function syncFolderCatalog(): Promise<void> {
  return (running ??= run().finally(() => {
    running = undefined;
  }));
}
async function run() {
  const initial = await loadSync();
  if (!initial.enabled || !initial.account) return;
  const account = initial.account;
  const current = () =>
    folderCatalogTransaction(account, (state) => structuredClone(state));
  if (!(await current())) return;
  const supported = await supportsFolderCatalog(account.origin);
  if (!(await current())) return;
  if (!supported) throw new FolderCatalogUnavailable();
  // Even a pending retry pulls first so remote deletions and restored servers are observed.
  let proposed: FolderCatalog | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const sent = await current();
    if (!sent?.sync) return;
    const response = (await folderCall(account, {
      revision: sent.sync.revision,
      state: proposed,
    })) as { revision?: unknown; state?: unknown; accepted?: unknown } | null;
    if (!(await current())) return;
    if (
      !response ||
      !Number.isSafeInteger(response.revision) ||
      (response.revision as number) < 0 ||
      typeof response.accepted !== 'boolean' ||
      (proposed !== null && (response.revision as number) < sent.sync.revision)
    )
      throw new Error('Invalid folder sync response.');
    const revision = response.revision as number;
    const remote = validateFolderCatalog(response.state);
    const merged = await folderCatalogTransaction(account, (state) => {
      const baseline =
        revision < sent.sync!.revision
          ? emptyFolderCatalog()
          : proposed && response.accepted
            ? proposed
            : sent.sync!.baseline;
      state.value = mergeFolderCatalog(baseline, state.value, remote);
      state.sync = { account: sent.sync!.account, revision, baseline: remote };
      return structuredClone(state.value);
    });
    if (!merged) return;
    if (JSON.stringify(merged) === JSON.stringify(remote)) return;
    proposed = merged;
  }
  throw new Error('Folders changed on another device. Sync again to finish.');
}
