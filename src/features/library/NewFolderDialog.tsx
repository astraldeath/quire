import { useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useDraftGuard } from '../../components/useDraftGuard';
import { editFolderCatalog } from '../../storage';
import { FolderPicker } from './FolderPicker';
import { newFolderPath } from './folders';

export function NewFolderDialog({
  paths,
  parent,
  scope,
  onCreated,
  onClose,
}: {
  paths: string[];
  parent: string;
  scope: 'library' | 'hidden';
  onCreated(path: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [selectedParent, setSelectedParent] = useState(parent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const dirty = !!name.trim() || selectedParent !== parent;
  const guard = useDraftGuard({ dirty, busy });
  return (
    <>
      <Modal
        title="New folder"
        onClose={() => guard.requestLeave(onClose)}
        initialFocus={nameInput}
      >
        <form
          className="settings-body new-folder-form"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving.current) return;
            saving.current = true;
            setBusy(true);
            setError('');
            try {
              const target = newFolderPath(name, selectedParent);
              if (paths.includes(target))
                throw new Error('A folder with this name already exists.');
              await editFolderCatalog((state) => {
                if (state.value[scope].includes(target))
                  throw new Error('A folder with this name already exists.');
                state.value[scope] = [...state.value[scope], target];
              });
              onCreated(target);
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'Could not create the folder.',
              );
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input
              ref={nameInput}
              type="text"
              aria-label="Folder name"
              value={name}
              disabled={busy}
              maxLength={255}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
            />
          </label>
          <fieldset className="folder-parent-field">
            <legend>Parent</legend>
            <FolderPicker
              paths={['', ...paths]}
              selected={[selectedParent]}
              mode="single"
              disabled={busy}
              onToggle={(path, checked) => {
                if (checked) setSelectedParent(path);
                else if (path === selectedParent) setSelectedParent('');
                setError('');
              }}
            />
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => guard.requestLeave(onClose)}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create folder'}
            </button>
          </div>
        </form>
      </Modal>
      {guard.confirmation}
    </>
  );
}
