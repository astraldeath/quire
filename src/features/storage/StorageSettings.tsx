import { useEffect, useState } from 'react';
import { Switch, StepperControl } from '../../components/Controls';
import { loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { readPolicy, writePolicy, type StoragePolicy } from './policy';
import { storageMessage } from './manager';

export function StorageSettings() {
  const [account, setAccount] = useState<Account>();
  const [policy, setPolicy] = useState<StoragePolicy>();
  const [message, setMessage] = useState('');
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
      {!account || !policy ? (
        <p className="muted">
          Connect to a server to use automatic uploads and offloading.
        </p>
      ) : (
        <>
          <Switch
            label="Auto-upload books"
            checked={policy.autoUpload}
            onChange={(autoUpload) => change({ autoUpload })}
          />
          <p className="muted">
            Uploads existing and new EPUBs to your personal library on{' '}
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
                <StepperControl
                  label="Download limit"
                  value={policy.maxMB}
                  min={128}
                  max={1048576}
                  step={128}
                  unit=" MB"
                  onChange={(maxMB) => change({ maxMB })}
                />
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
