import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Lock } from 'lucide-react';
import { Switch } from '../../components/Controls';
import { usePrivacy } from './Privacy';
import { credential } from './model';
export function PrivacySettings() {
  const p = usePrivacy();
  const [biometric, setBiometric] = useState(false);
  const [change, setChange] = useState(false);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (isTauri())
      void invoke<boolean>('plugin:privacy|available')
        .then(setBiometric)
        .catch(() => {});
  }, []);
  const run = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="settings-body">
      <section className="backup-settings">
        <h3>Private books</h3>
        <p className="muted">
          Passcode and book privacy sync with your server account. Files and
          backups are not encrypted.
        </p>
        <button
          onClick={() =>
            void run(async () => {
              if (p.state.credential) {
                if (await p.authenticate(true)) setChange(true);
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
                if (code !== confirm)
                  throw new Error('Passcodes do not match.');
                p.update({
                  credential: await credential(code),
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
            <button className="primary">Save passcode</button>
          </form>
        )}
        {p.state.credential && (
          <>
            {biometric && (
              <Switch
                label="Use Face ID or Touch ID"
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
