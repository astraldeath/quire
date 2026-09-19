import { usePrivacy } from '../privacy/Privacy';
import { validFolders } from '../library/folders';
import {
  conflictsForReview,
  recordKey,
  type SyncState,
  type RemoteRecord,
  type Candidate,
} from './model';

export function ConflictChoices({
  state,
  busy,
  onResolve,
}: {
  state: SyncState;
  busy: boolean;
  onResolve(record: RemoteRecord, candidate: Candidate): void;
}) {
  const privacy = usePrivacy();
  const conflicts = conflictsForReview(state);
  if (!state.enabled || !conflicts.length) return null;
  return (
    <section>
      <h3>Choose which version to keep</h3>
      {conflicts.map((record) =>
        !privacy.access(record.bookId) ? (
          <button
            key={recordKey(record)}
            onClick={() => void privacy.authenticate()}
          >
            Unlock private book to resolve conflict
          </button>
        ) : (
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
        ),
      )}
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
  const choice = (candidate: Candidate) => (
    <button
      key={candidate.operationId}
      disabled={busy}
      onClick={() => onResolve(record, candidate)}
    >
      <span>
        {candidate.deleted
          ? 'Keep deletion'
          : record.kind === 'position'
            ? `${candidate.value?.section || 'Reading position'} · ${Math.round(Number(candidate.value?.fraction) * 100)}%`
            : String(
                candidate.value?.note ||
                  candidate.value?.text ||
                  candidate.value?.title ||
                  'Saved passage',
              )}
      </span>
      {!candidate.deleted && record.kind === 'book' && (
        <small>
          {validFolders(candidate.value?.folders)
            ? candidate.value.folders.length
              ? `Folders: ${candidate.value.folders.join(', ')}`
              : 'No folders'
            : typeof candidate.value?.folder === 'string' &&
                candidate.value.folder
              ? `Folder: ${candidate.value.folder}`
              : 'Keep current folders'}
        </small>
      )}
      <small>
        {local.includes(candidate) ? 'Use local version' : 'Use server version'}
      </small>
    </button>
  );
  return (
    <>
      {local.map(choice)}
      {remote.slice(-1).map(choice)}
      {remote.length > 1 && (
        <details>
          <summary>Other versions ({remote.length - 1})</summary>
          {remote.slice(0, -1).map(choice)}
        </details>
      )}
    </>
  );
}
