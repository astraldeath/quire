import { useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import type { Account } from '../sync/model';
import { opdsAccountRequest } from './sources';
import { supportsOpds } from '../sync/transport';
export function OpdsAccessSettings({ account }: { account: Account }) {
  return (
    <AccountOpdsAccess
      key={`${account.origin}:${account.username}:${account.sessionId}`}
      account={account}
    />
  );
}
function AccountOpdsAccess({ account }: { account: Account }) {
  const [passwords, setPasswords] = useState<
      { id: string; name: string; createdAt: number }[]
    >([]),
    [name, setName] = useState(''),
    [secret, setSecret] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [supported, setSupported] = useState<boolean>(),
    [copied, setCopied] = useState('');
  const refresh = async () =>
    setPasswords(
      (await opdsAccountRequest(account, '/v1/opds/passwords')).passwords,
    );
  useEffect(() => {
    let live = true;
    void supportsOpds(account.origin)
      .then(async (yes) => {
        if (!live) return;
        setSupported(yes);
        if (yes) await refresh();
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [account.origin, account.username, account.sessionId]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not update OPDS access.',
      );
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError('Could not copy. Select and copy the value below.');
    }
  };
  return (
    <section className="opds-access">
      <h3>OPDS access</h3>
      {supported === false ? (
        <p className="settings-note">
          Update Quire Server to enable OPDS access.
        </p>
      ) : (
        <>
          <p className="settings-note">
            Read your server library in other apps. Hidden and locked books are
            excluded.
          </p>
          <div className="opds-address">
            <label>
              OPDS 1.2
              <input
                readOnly
                value={account.origin + '/opds'}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="icon"
              aria-label="Copy OPDS 1.2 URL"
              onClick={() =>
                void copy(account.origin + '/opds', 'Catalog URL copied')
              }
            >
              <Copy />
            </button>
          </div>
          <div className="opds-address">
            <label>
              OPDS 2.0
              <input
                readOnly
                value={account.origin + '/opds/v2'}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="icon"
              aria-label="Copy OPDS 2.0 URL"
              onClick={() =>
                void copy(account.origin + '/opds/v2', 'Catalog URL copied')
              }
            >
              <Copy />
            </button>
          </div>
          {secret && (
            <div className="opds-secret">
              <p>Save this password now. It won’t be shown again.</p>
              <label>
                Username
                <input readOnly value={account.username} />
              </label>
              <div className="opds-address">
                <label>
                  App password
                  <input
                    readOnly
                    value={secret}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button
                  className="icon"
                  aria-label="Copy app password"
                  onClick={() => void copy(secret, 'Password copied')}
                >
                  <Copy />
                </button>
              </div>
              <button onClick={() => setSecret('')}>Done</button>
            </div>
          )}
          <form
            className="opds-create"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await opdsAccountRequest(
                  account,
                  '/v1/opds/passwords',
                  { name: name.trim() },
                );
                setSecret(result.password);
                setName('');
                setCopied('');
              });
            }}
          >
            <label>
              Password name
              <input
                required
                maxLength={100}
                placeholder="e.g. Tablet reader"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy || !name.trim() || !supported}>
              <KeyRound />
              Create password
            </button>
          </form>
          {passwords.map((p) => (
            <div className="opds-password" key={p.id}>
              <span>{p.name}</span>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await opdsAccountRequest(
                      account,
                      '/v1/opds/passwords/' + encodeURIComponent(p.id),
                      undefined,
                      'DELETE',
                    );
                    setSecret('');
                  })
                }
              >
                <Trash2 />
                Revoke
              </button>
            </div>
          ))}
        </>
      )}
      {copied && (
        <p role="status" className="settings-note">
          {copied}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
