import { TaskError } from '../../components/TaskError';
import { useEffect, useState } from 'react';
import { Switch, StepperControl } from '../../components/Controls';
import { localFileSummary, loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { readPolicy, writePolicy, type StoragePolicy } from './policy';
import { storageMessage } from './manager';

export function StorageSettings({ onConnect }: { onConnect(): void }) {
  const [account, setAccount] = useState<Account>();
  const [policy, setPolicy] = useState<StoragePolicy>();
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<{ books: number; bytes: number }>();
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(false);
  const measure = () => {
    setError('');
    void localFileSummary()
      .then(setSummary)
      .catch(() => {
        setSummary(undefined);
        setError(
          'Could not measure downloads. Check device storage access and retry.',
        );
      });
  };
  useEffect(() => {
    measure();
    window.addEventListener('quire-storage', measure);
    return () => window.removeEventListener('quire-storage', measure);
  }, []);
  useEffect(() => {
    let alive = true;
    const update = () => {
      void loadSync()
        .then((s) => {
          if (!alive) return;
          setAccount(s.enabled ? s.account : undefined);
          setPolicy(s.account ? readPolicy(s.account) : undefined);
          setMessage(storageMessage());
        })
        .catch(() => {});
    };
    update();
    window.addEventListener('quire-storage-status', update);
    window.addEventListener('quire-storage-policy', update);
    window.addEventListener('quire-synced', update);
    return () => {
      alive = false;
      window.removeEventListener('quire-storage-status', update);
      window.removeEventListener('quire-storage-policy', update);
      window.removeEventListener('quire-synced', update);
    };
  }, []);
  const change = (patch: Partial<StoragePolicy>) => {
    if (account) {
      writePolicy(account, patch);
      setPolicy(readPolicy(account));
    }
  };
  return (
    <section className="storage-settings">
      <h3>Storage</h3>
      {summary && (
        <p>
          {summary.books} downloaded {summary.books === 1 ? 'book' : 'books'} ·{' '}
          {(summary.bytes / 1073741824).toFixed(2)} GiB
        </p>
      )}
      {error && <TaskError summary={error} detail="" onRetry={measure} />}
      {!summary && !error && <p role="status">Measuring downloads…</p>}
      {!account || !policy ? (
        <>
          <p className="muted">
            Connect to a server to use automatic uploads and offloading.
          </p>
          <button onClick={onConnect}>Connect server</button>
        </>
      ) : (
        <>
          <Switch
            label="Auto-upload books"
            checked={policy.autoUpload}
            onChange={(autoUpload) => change({ autoUpload })}
          />
          <p className="muted">
            Uploads existing and new books to your personal library on{' '}
            {account.origin} while Quire is open.
          </p>
          <Switch
            label="Automatically offload downloads"
            checked={policy.offload}
            onChange={(offload) => change({ offload })}
          />
          {policy.offload && (
            <div className="storage-rules">
              <Switch
                label="Finished books only"
                checked={policy.finishedOnly}
                onChange={(finishedOnly) => change({ finishedOnly })}
              />
              <StepperControl
                label="Not opened for"
                value={policy.days}
                min={1}
                max={3650}
                step={1}
                unit=" days"
                onChange={(days) => change({ days })}
              />
              <Switch
                label="Only above a storage limit"
                checked={policy.maxMB > 0}
                onChange={(enabled) => change({ maxMB: enabled ? 1024 : 0 })}
              />
              {policy.maxMB > 0 && (
                <>
                  <label>
                    Download limit
                    <select
                      value={
                        !custom &&
                        [1024, 2048, 5120, 10240].includes(policy.maxMB)
                          ? String(policy.maxMB)
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustom(value === 'custom');
                        if (value !== 'custom')
                          change({ maxMB: Number(value) });
                      }}
                    >
                      {[1, 2, 5, 10].map((gib) => (
                        <option key={gib} value={gib * 1024}>
                          {gib} GiB
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  {(custom ||
                    ![1024, 2048, 5120, 10240].includes(policy.maxMB)) && (
                    <label>
                      Custom limit (GiB)
                      <input
                        type="number"
                        min={1 / 1024}
                        max={1024}
                        step="any"
                        value={policy.maxMB / 1024}
                        onChange={(e) => {
                          const gib = Number(e.target.value);
                          if (Number.isFinite(gib) && gib > 0 && gib <= 1024)
                            change({
                              maxMB: Math.max(1, Math.round(gib * 1024)),
                            });
                        }}
                      />
                    </label>
                  )}
                </>
              )}
              <p className="muted">
                Removes downloads only after verifying the server copy. Keeps
                notes, progress, the open book, and books marked “Keep
                downloaded”. Offloaded books download again when opened.
              </p>
            </div>
          )}
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
