import { useDraftGuard } from '../../components/useDraftGuard';
import { TaskError } from '../../components/TaskError';
import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Lock } from 'lucide-react';
import { Switch } from '../../components/Controls';
import { usePrivacy } from './Privacy';
import { credential } from './model';
import { ScreenCaptureSettings } from './ScreenCaptureSettings';
export function PrivacySettings({
  connected = false,
}: {
  connected?: boolean;
}) {
  const p = usePrivacy();
  const [biometric, setBiometric] = useState(false);
  const [change, setChange] = useState(false);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useDraftGuard({ dirty: change && !!(code || confirm), busy });
  const cancel = () => {
    setChange(false);
    setCode('');
    setConfirm('');
    setError('');
  };
  useEffect(() => {
    if (!p.unlocked) cancel();
  }, [p.unlocked]);
  useEffect(() => {
    if (isTauri())
      void invoke<boolean>('plugin:privacy|available')
        .then(setBiometric)
        .catch(() => {});
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      setError('');
      await action();
    } catch {
      setError('Could not update privacy settings. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-body">
      <section className="backup-settings">
        <h3>Private books</h3>
        <p className="muted">
          {connected
            ? 'Passcode and book privacy sync with your server account.'
            : 'Privacy settings stay on this device. Connect a server to sync them.'}{' '}
          Files and backups are not encrypted. Passcodes cannot be recovered.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (p.state.credential) {
                if (await p.authenticate(true)) {
                  setCode('');
                  setConfirm('');
                  setChange(true);
                }
              } else await p.authenticate();
            })
          }
        >
          {p.state.credential ? 'Change passcode' : 'Create passcode'}
        </button>
        {change && (
          <form
            className="settings-body"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!p.unlocked) {
                  setChange(false);
                  return;
                }
                if (code !== confirm) {
                  setError('Passcodes do not match.');
                  return;
                }
                if (!/^\d{6,12}$/.test(code)) {
                  setError('Use 6�12 digits.');
                  return;
                }
                const nextCredential = await credential(code);
                if (!p.isUnlocked()) {
                  cancel();
                  return;
                }
                p.update({
                  credential: nextCredential,
                  failures: 0,
                  retryAt: 0,
                });
                setChange(false);
                setCode('');
                setConfirm('');
              });
            }}
          >
            <label>
              New passcode
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label>
              Confirm passcode
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving�' : 'Save passcode'}
            </button>
            <button type="button" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </form>
        )}
        {p.state.credential && (
          <>
            {biometric && (
              <Switch
                label="Biometric unlock"
                checked={p.state.biometrics}
                onChange={(value) =>
                  void run(async () => {
                    if (await p.authenticate(true))
                      p.update({ biometrics: value });
                  })
                }
              />
            )}
            <Switch
              label="Lock when leaving the app"
              checked={p.state.autoLock}
              onChange={(value) =>
                void run(async () => {
                  if (await p.authenticate(true)) p.update({ autoLock: value });
                })
              }
            />
            {p.unlocked && (
              <button onClick={p.lock}>
                <Lock />
                Lock now
              </button>
            )}
          </>
        )}
      </section>
      <section className="backup-settings">
        <h3>Privacy screen</h3>
        <Switch
          label="Cover when inactive"
          checked={p.state.shield}
          onChange={(shield) => void run(async () => p.update({ shield }))}
        />
        <p className="muted">
          Show Quire’s wordmark while away. This does not lock books.
        </p>
        {!isTauri() && p.state.shield && (
          <Switch
            label="Also cover when the browser loses focus"
            checked={p.state.coverOnBlur}
            onChange={(coverOnBlur) =>
              void run(async () => p.update({ coverOnBlur }))
            }
          />
        )}
      </section>
      <ScreenCaptureSettings />
      {guard.confirmation}
      {error && <TaskError summary={error} detail="" />}
    </div>
  );
}
