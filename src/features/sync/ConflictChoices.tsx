import { usePrivacy } from '../privacy/Privacy';
import type { Book } from '../../domain/models';
import { conflictFields } from './conflictPresentation';
import {
  conflictsForReview,
  recordKey,
  type SyncState,
  type RemoteRecord,
  type Candidate,
} from './model';

export function ConflictChoices({
  books,
  state,
  busy,
  onResolve,
}: {
  books: Book[];
  state: SyncState;
  busy: boolean;
  onResolve(record: RemoteRecord, candidate: Candidate): void;
}) {
  const privacy = usePrivacy();
  const conflicts = conflictsForReview(state);
  if (!state.enabled || !conflicts.length) return null;
  const groups = new Map<string, RemoteRecord[]>();
  const locked = new Set<string>();
  for (const record of conflicts) {
    if (!privacy.access(record.bookId)) {
      locked.add(record.bookId);
      continue;
    }
    const records = groups.get(record.bookId) ?? [];
    records.push(record);
    groups.set(record.bookId, records);
  }
  return (
    <section className="sync-conflicts">
      <h3>Choose which version to keep</h3>
      {[...groups].map(([bookId, records]) => (
        <section className="sync-conflict-book" key={bookId}>
          <h4>
            {books.find((book) => book.id === bookId)?.title ||
              'Book title unavailable'}
          </h4>
          {records.map((record) => (
            <div className="sync-conflict" key={recordKey(record)}>
              <strong>
                {record.kind === 'position'
                  ? 'Reading position'
                  : record.kind === 'book'
                    ? 'Book information'
                    : 'Saved passage'}
              </strong>
              <VersionChoices
                record={record}
                state={state}
                busy={busy}
                onResolve={onResolve}
              />
            </div>
          ))}
        </section>
      ))}
      {[...locked].map((bookId) => (
        <div className="sync-conflict-locked" key={bookId}>
          <button type="button" onClick={() => void privacy.authenticate()}>
            Unlock private book to resolve conflict
          </button>
        </div>
      ))}
    </section>
  );
}

function VersionChoices({
  record,
  state,
  busy,
  onResolve,
}: {
  record: RemoteRecord;
  state: SyncState;
  busy: boolean;
  onResolve(record: RemoteRecord, candidate: Candidate): void;
}) {
  const local = record.candidates.filter((c) =>
    state.pending.some((p) => p.id === c.operationId),
  );
  const remote = record.candidates.filter((c) => !local.includes(c));
  const choice = (candidate: Candidate, source: 'Local' | 'Server') => (
    <button
      key={candidate.operationId}
      type="button"
      disabled={busy}
      onClick={() => onResolve(record, candidate)}
    >
      <span className="sync-conflict-source">{source} version</span>
      {candidate.deleted ? (
        <span className="sync-conflict-deletion">Keep deletion</span>
      ) : (
        <span className="sync-conflict-fields">
          {conflictFields(record.kind, candidate).map((field) => (
            <span key={field.label}>
              <small>{field.label}</small>
              <span>{field.value}</span>
            </span>
          ))}
        </span>
      )}
      <small className="sync-conflict-time">
        {source === 'Local' && candidate.createdAt === 0
          ? 'Unsynced change on this device'
          : `Changed ${new Date(candidate.createdAt).toLocaleString()}`}
      </small>
    </button>
  );
  return (
    <div className="sync-conflict-choices">
      {local.map((candidate) => choice(candidate, 'Local'))}
      {remote.map((candidate) => choice(candidate, 'Server'))}
    </div>
  );
}
