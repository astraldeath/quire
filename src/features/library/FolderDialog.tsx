import { useRef, useState } from 'react';
import { FolderOpen, FolderPlus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { normalizeFolder } from './folders';

export function FolderDialog({
  paths,
  initial,
  rename = false,
  onSave,
  onClose,
}: {
  paths: string[];
  initial: string;
  rename?: boolean;
  onSave(path: string): Promise<void>;
  onClose(): void;
}) {
  const [destination, setDestination] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  return (
    <Modal
      title={rename ? 'Rename folder' : 'Move to folder'}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form
        className="settings-body"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving.current) return;
          saving.current = true;
          setBusy(true);
          setError('');
          try {
            if ((creating && !name.trim()) || (rename && !destination.trim()))
              throw new Error('Enter a folder name.');
            const path = normalizeFolder(
              creating
                ? [destination, name].filter(Boolean).join('/')
                : destination,
            );
            await onSave(path);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : rename
                  ? 'Could not rename folder.'
                  : 'Could not move books.',
            );
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          {creating ? 'Parent folder' : 'Folder'}
          {rename ? (
            <input
              autoFocus
              disabled={busy}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              maxLength={1024}
            />
          ) : (
            <select
              disabled={busy}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Library</option>
              {paths.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          )}
        </label>
        {!rename && creating && (
          <label>
            New folder
            <input
              autoFocus
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name or parent/name"
              maxLength={1024}
            />
          </label>
        )}
        {!rename && (
          <button
            className="text-action"
            type="button"
            disabled={busy}
            onClick={() => {
              setCreating(!creating);
              setError('');
            }}
          >
            {creating ? <FolderOpen /> : <FolderPlus />}
            {creating ? 'Use existing folder' : 'New folder'}
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : rename ? 'Rename' : 'Move'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
