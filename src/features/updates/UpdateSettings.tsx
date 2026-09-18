import { Download, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { checkUpdates, installReaderUpdate, useUpdates } from './service';
import changelog from '../../../CHANGELOG.md?raw';
import './updates.css';

function Notes({
  text,
  label = "What's new",
}: {
  text: string;
  label?: string;
}) {
  return text.trim() ? (
    <details className="update-notes">
      <summary>{label}</summary>
      <div>{text}</div>
    </details>
  ) : null;
}
export function UpdateSettings({
  onBusy,
  beforeUpdate,
}: {
  onBusy?: (busy: boolean) => void;
  beforeUpdate?: () => Promise<void>;
}) {
  const { reader, server } = useUpdates();
  useEffect(() => {
    onBusy?.(reader.installing);
    return () => onBusy?.(false);
  }, [reader.installing, onBusy]);
  const currentNotes =
    changelog.split(/^## /m)[1]?.replace(/^.*\n/, '').trim() ?? '';
  const busy = reader.installing || reader.checking || server.checking;
  return (
    <div className="updates-settings">
      <section className="update-section" aria-label="Reader updates">
        <div className="update-heading">
          <strong>Quire reader</strong>
          <span>{reader.version}</span>
        </div>
        {reader.available ? (
          <>
            <p>Version {reader.available.version} is available.</p>
            <Notes text={reader.available.notes} />
            <button
              className="primary"
              disabled={busy}
              onClick={() => void installReaderUpdate(beforeUpdate)}
            >
              <Download />
              {reader.installing ? 'Installing…' : 'Update and restart'}
            </button>
          </>
        ) : (
          <p className="muted">
            {reader.checking
              ? 'Checking for updates…'
              : reader.supported
                ? reader.error
                  ? 'Unable to check for updates.'
                  : 'You have the latest reader.'
                : import.meta.env.VITE_HOSTED === 'true'
                  ? 'The web reader updates with your server.'
                  : 'Install new versions through your app distributor.'}
          </p>
        )}
        {reader.installing && (
          <div role="status">
            <progress
              aria-label="Installing reader update"
              max={100}
              value={reader.progress}
            />
            <span>
              {reader.progress === undefined
                ? 'Preparing update…'
                : `${Math.round(reader.progress)}%`}
            </span>
          </div>
        )}
        {reader.error && (
          <p className="update-error" role="status">
            {reader.error}
          </p>
        )}
        {!reader.available && <Notes text={currentNotes} />}
      </section>
      <section className="update-section" aria-label="Server updates">
        <div className="update-heading">
          <strong>Quire server</strong>
          {server.data && <span>{server.data.current.version}</span>}
        </div>
        {server.data?.available && server.data.latest ? (
          <>
            <p>Version {server.data.latest.version} is available.</p>
            <Notes text={server.data.latest.notes} />
            {server.data.canManage ? (
              <details className="update-notes">
                <summary>Update server</summary>
                <p>Run from your Compose directory:</p>
                <pre>docker compose pull{'\n'}docker compose up -d</pre>
              </details>
            ) : (
              <p className="muted">Ask your server administrator to update.</p>
            )}
          </>
        ) : (
          <p className="muted">
            {server.checking
              ? 'Checking for updates…'
              : server.data
                ? server.data.error || server.error
                  ? 'Version check unavailable.'
                  : 'You have the latest server.'
                : server.error
                  ? 'Unable to check this server.'
                  : 'Connect a server to check for updates.'}
          </p>
        )}
        {(server.error || server.data?.error) && (
          <p role="status" className="update-error">
            {server.error || server.data?.error}
          </p>
        )}
      </section>
      <button
        className="text-action update-check"
        disabled={busy}
        onClick={() => void checkUpdates(true)}
      >
        <RefreshCw />
        Check for updates
      </button>
    </div>
  );
}

export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  const { reader, server } = useUpdates();
  if (!reader.available && !server.data?.available) return null;
  return (
    <button className="update-notice" onClick={onOpen}>
      <Download aria-hidden="true" />
      <span>
        {reader.available && server.data?.available
          ? 'Reader and server updates available'
          : reader.available
            ? 'Reader update available'
            : 'Server update available'}
      </span>
      <span className="update-notice-action">View</span>
    </button>
  );
}
