import { useLayoutEffect, useRef, useState } from 'react';
import { Check, EyeOff, Globe, Pencil, RefreshCw } from 'lucide-react';
import { Switch } from '../../components/Controls';
import { useDraftGuard } from '../../components/useDraftGuard';
import { TaskError } from '../../components/TaskError';
import { trackingRequest, type TrackingSession } from './client';
import { syncNow } from '../sync/engine';
import {
  entryPatch,
  parseEntry,
  readingStates,
  type TrackerEntry,
} from './entry';

export function TrackerEntryPanel({
  account,
  seriesId,
  refreshKey,
  onGuardChange,
  onRequestLeave,
}: {
  account: TrackingSession;
  seriesId: number;
  refreshKey: number;
  onGuardChange?: (dirty: boolean, busy: boolean) => void;
  onRequestLeave?: (action: () => void) => void;
}) {
  const [entry, setEntry] = useState<TrackerEntry | null>();
  const [draft, setDraft] = useState<TrackerEntry>();
  const [editBase, setEditBase] = useState<TrackerEntry>();
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const [privateEntry, setPrivateEntry] = useState(true);
  const statusInput = useRef<HTMLSelectElement>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const identity =
    account.kind === 'native'
      ? `native:${seriesId}`
      : JSON.stringify([account.account, seriesId]);
  const previousIdentity = useRef(identity);
  const currentAccountId = useRef('');
  const dirty =
    (!!draft && JSON.stringify(draft) !== JSON.stringify(editBase)) ||
    (entry === null && !privateEntry);
  // The containing dialog owns navigation protection when embedded. Standalone
  // panels retain their own guard, without registering duplicate blockers.
  const guard = useDraftGuard({
    dirty: !onRequestLeave && (dirty || busy),
    busy,
  });
  const requestLeave = onRequestLeave ?? guard.requestLeave;
  useLayoutEffect(() => {
    if (draft) statusInput.current?.focus({ preventScroll: true });
  }, [!!draft]);
  useLayoutEffect(() => {
    onGuardChange?.(dirty, busy);
  }, [dirty, busy, onGuardChange]);
  useLayoutEffect(() => () => onGuardChange?.(false, false), [onGuardChange]);
  const path = `/v1/tracking/entries/${seriesId}`;
  useLayoutEffect(() => {
    let alive = true;
    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    if (previousIdentity.current !== identity) {
      previousIdentity.current = identity;
      setEntry(undefined);
      setDraft(undefined);
      setEditBase(undefined);
      setPrivateEntry(true);
      setAccountId('');
      currentAccountId.current = '';
    }
    setLoading(true);
    setError('');
    void trackingRequest(account, path, undefined, undefined, {
      signal: controller.signal,
    })
      .then((data) => {
        const value = data.entry === null ? null : parseEntry(data.entry);
        if (typeof data.accountId !== 'string' || !data.accountId)
          throw new Error(
            'Reload the tracker to verify your MangaBaka account.',
          );
        if (alive && requestGeneration === generation.current) {
          if (
            currentAccountId.current &&
            currentAccountId.current !== data.accountId
          ) {
            setDraft(undefined);
            setEditBase(undefined);
            setPrivateEntry(true);
          }
          currentAccountId.current = data.accountId;
          setEntry(value);
          setAccountId(data.accountId);
        }
      })
      .catch((e) => {
        if (alive && requestGeneration === generation.current)
          setError(e instanceof Error ? e.message : 'Could not load tracker.');
      })
      .finally(() => {
        if (alive && requestGeneration === generation.current)
          setLoading(false);
      });
    return () => {
      alive = false;
      generation.current++;
      controller.abort();
    };
  }, [identity, path, refreshKey, reload]);
  async function save(create = false) {
    if (mutation.current || loading || (!create && (!entry || !draft))) return;
    mutation.current = true;
    const requestGeneration = generation.current;
    setBusy(true);
    setError('');
    try {
      const changes = create ? undefined : entryPatch(editBase!, draft!);
      if (!create && !Object.keys(changes!).length) {
        setDraft(undefined);
        return;
      }
      if (
        !create &&
        account.kind === 'hosted' &&
        ['state', 'progress_chapter', 'progress_volume'].some(
          (key) => key in changes!,
        )
      )
        await syncNow();
      if (requestGeneration !== generation.current) return;
      const data = await trackingRequest(
        account,
        path,
        create
          ? { expectedAccountId: accountId, is_private: privateEntry }
          : { expectedAccountId: accountId, changes },
        create ? 'POST' : 'PUT',
      );
      if (requestGeneration === generation.current) {
        setEntry(parseEntry(data.entry));
        setDraft(undefined);
      }
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(e instanceof Error ? e.message : 'Could not save tracker.');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const field = (
    key: keyof TrackerEntry,
    value: TrackerEntry[keyof TrackerEntry],
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const numeric = (
    key: 'progress_chapter' | 'progress_volume' | 'rating',
    label: string,
    max: number,
  ) => (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max={max}
        step="any"
        placeholder="Not set"
        value={draft![key] ?? ''}
        onChange={(e) =>
          field(key, e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </label>
  );
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(value + 'T00:00:00Z'))
      : 'Not set';
  return (
    <section className="tracker-entry" aria-label="MangaBaka reading status">
      {error && <TaskError summary={error} detail="" />}
      {entry === undefined ? (
        <div className="tracker-entry-heading">
          <span className="muted">
            {loading ? 'Loading reading status…' : 'Reading status unavailable'}
          </span>
          {!loading && (
            <button
              className="icon"
              aria-label="Reload reading status"
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      ) : entry === null ? (
        <div className="tracker-entry-missing">
          <p className="muted">Not in your MangaBaka library yet.</p>
          <Switch
            label="Track privately on MangaBaka"
            checked={privateEntry}
            onChange={setPrivateEntry}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={() => void save(true)}
          >
            <Check size={16} />
            Start tracking
          </button>
        </div>
      ) : draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="tracker-entry-fields">
            <label>
              Reading status
              <select
                ref={statusInput}
                value={draft.state}
                onChange={(e) => field('state', e.target.value)}
              >
                {Object.entries(readingStates).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {numeric('rating', 'Score / 100', 100)}
            {numeric('progress_chapter', 'Chapters read', 10000)}
            {numeric('progress_volume', 'Volumes read', 10000)}
            <label>
              Start date
              <input
                type="date"
                min="1679-01-01"
                max="2262-12-31"
                value={draft.start_date ?? ''}
                onChange={(e) => field('start_date', e.target.value || null)}
              />
            </label>
            <label>
              Finish date
              <input
                type="date"
                min="1679-01-01"
                max="2262-12-31"
                value={draft.finish_date ?? ''}
                onChange={(e) => field('finish_date', e.target.value || null)}
              />
            </label>
            <div className="tracker-entry-wide">
              <Switch
                label="Track privately on MangaBaka"
                checked={draft.is_private}
                onChange={(v) => field('is_private', v)}
              />
            </div>
          </fieldset>
          <div className="tracker-entry-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => requestLeave(() => setDraft(undefined))}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              <Check size={16} />
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="tracker-entry-heading">
            <span className="tracker-visibility">
              {entry.is_private ? <EyeOff size={14} /> : <Globe size={14} />}{' '}
              {entry.is_private ? 'Private tracking' : 'Public tracking'}
            </span>
            <div className="tracker-entry-tools">
              <button
                className="icon"
                disabled={busy}
                aria-label="Refresh status"
                title="Refresh status"
                onClick={() => setReload((n) => n + 1)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setEditBase(entry);
                  setDraft({ ...entry });
                }}
              >
                <Pencil size={16} />
                Edit status
              </button>
            </div>
          </div>
          <dl className="tracker-entry-summary">
            <div>
              <dt>Status</dt>
              <dd>{readingStates[entry.state]}</dd>
            </div>
            <div>
              <dt>Chapters</dt>
              <dd>{entry.progress_chapter ?? 0}</dd>
            </div>
            <div>
              <dt>Volumes</dt>
              <dd>{entry.progress_volume ?? 0}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>
                {entry.rating === null ? 'Not set' : `${entry.rating} / 100`}
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{date(entry.start_date)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{date(entry.finish_date)}</dd>
            </div>
          </dl>
        </>
      )}
      {guard.confirmation}
    </section>
  );
}
