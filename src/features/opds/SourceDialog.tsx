import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { PasswordField } from '../../components/PasswordField';
import { catalogUrl } from './parser';
import {
  saveCatalogSource,
  syncCatalogSources,
  type CatalogSource,
} from './sources';
export function SourceDialog({
  source,
  onClose,
  onSaved,
}: {
  source?: CatalogSource;
  onClose(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(source?.name ?? ''),
    [url, setUrl] = useState(source?.url ?? '');
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [replaceCredentials, setReplaceCredentials] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title={source ? 'Edit catalog' : 'Add catalog'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="catalog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await saveCatalogSource(
              {
                id: source?.id ?? crypto.randomUUID(),
                name: name.trim(),
                url: catalogUrl(url),
                revision: source?.revision ?? 0,
                deleted: false,
              },
              replaceCredentials
                ? username || password
                  ? { username, password }
                  : null
                : undefined,
            );
            await syncCatalogSources();
            onSaved();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'Could not save catalog.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Catalog URL
          <input
            required
            type="url"
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.org/opds"
            autoCapitalize="none"
            autoComplete="off"
          />
        </label>
        <details>
          <summary>Authentication</summary>
          <div className="catalog-form">
            <label className="catalog-check">
              <input
                type="checkbox"
                checked={replaceCredentials}
                onChange={(e) => setReplaceCredentials(e.target.checked)}
              />{' '}
              {source
                ? 'Replace saved credentials'
                : 'Use a username and password'}
            </label>
            {replaceCredentials && (
              <>
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {source && (
                  <small>Leave both empty to remove saved credentials.</small>
                )}
              </>
            )}
          </div>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
