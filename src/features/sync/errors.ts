export class SyncConflictError extends Error {
  constructor() {
    super('Some library changes need review in Settings → Sync.');
    this.name = 'SyncConflictError';
  }
}
