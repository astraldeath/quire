import { useRef, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useDraftGuard } from '../../components/useDraftGuard';
import { FolderPicker } from './FolderPicker';
import { newFolderPath } from './folders';

export type FolderChanges = Record<string, boolean>;

export function FolderMembershipDialog({
  paths,
  memberships,
  context,
  parent = '',
  onSave,
  onClose,
}: {
  paths: string[];
  memberships: string[][];
  context?: string;
  parent?: string;
  onSave(changes: FolderChanges): Promise<void>;
  onClose(): void;
}) {
  const [changes, setChanges] = useState<FolderChanges>({});
  const [creating, setCreating] = useState(
    paths.length === 0 && memberships.every((folders) => !folders.length),
  );
  const [name, setName] = useState('');
  const [selectedParent, setSelectedParent] = useState(parent);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const choices = [...new Set([...paths, ...memberships.flat()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const initial = Object.fromEntries(
    choices.map((path) => {
      const count = memberships.filter((folders) =>
        folders.includes(path),
      ).length;
      return [
        path,
        {
          checked: memberships.length > 0 && count === memberships.length,
          mixed: count > 0 && count < memberships.length,
        },
      ];
    }),
  ) as Record<string, { checked: boolean; mixed: boolean }>;
  const selected = choices.filter(
    (path) => changes[path] ?? initial[path]?.checked,
  );
  const mixed = choices.filter(
    (path) => changes[path] === undefined && initial[path]?.mixed,
  );
  const creationDirty =
    creating && (!!name.trim() || selectedParent !== parent);
  const dirty = Object.keys(changes).length > 0 || creationDirty;
  const guard = useDraftGuard({ dirty, busy });
  const toggle = (path: string, checked: boolean) => {
    setChanges((current) => {
      const next = { ...current };
      const start = initial[path];
      if (start && !start.mixed && start.checked === checked) delete next[path];
      else next[path] = checked;
      return next;
    });
    setError('');
  };
  return (
    <>
      <Modal
        title={context ? `Folders for ${context}` : 'Folders'}
        onClose={() => guard.requestLeave(onClose)}
        initialFocus={
          creating ? nameInput : choices.length > 8 ? searchInput : undefined
        }
        focusKey={creating ? 'new-folder' : 'folders'}
      >
        <form
          className="settings-body folder-membership"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving.current || !dirty) return;
            saving.current = true;
            setBusy(true);
            setError('');
            try {
              const next = { ...changes };
              if (creating) {
                const path = newFolderPath(name, selectedParent);
                if (choices.includes(path))
                  throw new Error('A folder with this name already exists.');
                next[path] = true;
              }
              await onSave(next);
              onClose();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'Could not save folders.',
              );
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          {choices.length > 0 && (
            <FolderPicker
              paths={choices}
              selected={selected}
              mixed={mixed}
              searchRef={searchInput}
              onToggle={toggle}
              disabled={busy}
            />
          )}
          {choices.length > 0 && (
            <button
              className="text-action"
              type="button"
              disabled={busy}
              onClick={() => {
                const changeMode = () => {
                  setCreating(!creating);
                  setName('');
                  setSelectedParent(parent);
                  setError('');
                };
                if (creationDirty) guard.requestLeave(changeMode);
                else changeMode();
              }}
            >
              <FolderPlus />
              {creating ? 'Cancel new folder' : 'New folder'}
            </button>
          )}
          {creating && (
            <div className="new-folder-fields">
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
              {choices.length > 0 && (
                <label>
                  Parent
                  <select
                    aria-label="Parent"
                    value={selectedParent}
                    disabled={busy}
                    onChange={(event) => {
                      setSelectedParent(event.target.value);
                      setError('');
                    }}
                  >
                    <option value="">Library</option>
                    {choices.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
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
            <button
              className="primary"
              disabled={busy || !dirty || (creating && !name.trim())}
            >
              {busy ? 'Saving…' : creating ? 'Create and add' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
      {guard.confirmation}
    </>
  );
}
