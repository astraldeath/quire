import { useEffect, useState } from 'react';
import { Check, EyeOff, Globe, Pencil, RefreshCw } from 'lucide-react';
import { Switch } from '../../components/Controls';
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
}: {
  account: TrackingSession;
  seriesId: number;
  refreshKey: number;
}) {
  const [entry, setEntry] = useState<TrackerEntry | null>();
  const [draft, setDraft] = useState<TrackerEntry>();
  const [editBase, setEditBase] = useState<TrackerEntry>();
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const [privateEntry, setPrivateEntry] = useState(true);
  const path = `/v1/tracking/entries/${seriesId}`;
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    void trackingRequest(account, path)
      .then((data) => {
        const value = data.entry === null ? null : parseEntry(data.entry);
        if (typeof data.accountId !== 'string' || !data.accountId)
          throw new Error(
            'Reload the tracker to verify your MangaBaka account.',
          );
        if (alive) {
          setEntry(value);
          setAccountId(data.accountId);
        }
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : 'Could not load tracker.');
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [account, path, refreshKey, reload]);
  async function save(create = false) {
    if (busy || (!create && (!entry || !draft))) return;
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
      const data = await trackingRequest(
        account,
        path,
        create
          ? { expectedAccountId: accountId, is_private: privateEntry }
          : { expectedAccountId: accountId, changes },
        create ? 'POST' : 'PUT',
      );
      setEntry(parseEntry(data.entry));
      setDraft(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save tracker.');
    } finally {
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {entry === undefined ? (
        <div className="tracker-entry-heading">
          <span className="muted">
            {busy ? 'Loading reading status…' : 'Reading status unavailable'}
          </span>
          {!busy && (
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
              onClick={() => setDraft(undefined)}
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
                aria-label="Refresh reading status"
                title="Refresh reading status"
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
                Edit
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
    </section>
  );
}
