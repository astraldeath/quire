import { useRef, useState } from 'react';
import { Folder, FolderPlus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { normalizeFolder } from './folders';

export type FolderChanges = Record<string, boolean>;

export function FolderMembershipDialog({
  paths,
  memberships,
  onSave,
  onClose,
}: {
  paths: string[];
  memberships: string[][];
  onSave(changes: FolderChanges): Promise<void>;
  onClose(): void;
}) {
  const [changes, setChanges] = useState<FolderChanges>({});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const choices = [...new Set([...paths, ...memberships.flat()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return (
    <Modal
      title="Folders"
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form
        className="settings-body folder-membership"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving.current) return;
          saving.current = true;
          setBusy(true);
          setError('');
          try {
            const next = { ...changes };
            if (creating) {
              const path = normalizeFolder(name);
              if (!path) throw new Error('Enter a folder name.');
              next[path] = true;
            }
            await onSave(next);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Could not save folders.',
            );
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      >
        {choices.length > 0 && (
          <div
            className="folder-choices"
            role="group"
            aria-label="Book folders"
          >
            {choices.map((path) => {
              const count = memberships.filter((paths) =>
                paths.includes(path),
              ).length;
              const mixed =
                changes[path] === undefined &&
                count > 0 &&
                count < memberships.length;
              const checked =
                changes[path] ??
                (memberships.length > 0 && count === memberships.length);
              return (
                <label key={path} className="folder-choice">
                  <Folder aria-hidden="true" />
                  <span>{path}</span>
                  <input
                    type="checkbox"
                    aria-label={path}
                    aria-checked={mixed ? 'mixed' : checked}
                    ref={(input) => {
                      if (input) input.indeterminate = mixed;
                    }}
                    checked={checked}
                    disabled={busy}
                    onChange={(event) =>
                      setChanges((current) => ({
                        ...current,
                        [path]: event.target.checked,
                      }))
                    }
                  />
                </label>
              );
            })}
          </div>
        )}
        <button
          className="text-action"
          type="button"
          disabled={busy}
          onClick={() => {
            setCreating(!creating);
            setError('');
          }}
        >
          <FolderPlus />
          {creating ? 'Cancel new folder' : 'New folder'}
        </button>
        {creating && (
          <label>
            Folder name
            <input
              type="text"
              autoFocus
              value={name}
              disabled={busy}
              maxLength={1024}
              placeholder="Name or parent/name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
