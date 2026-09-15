import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { accountRequest } from '../sync/transport';
import type { Account } from '../sync/model';
export function LibraryActions({
  account,
  library,
  onChange,
}: {
  account: Account;
  library: { id: string; name: string };
  onChange(): Promise<void>;
}) {
  const [mode, setMode] = useState<'rename' | 'delete'>(),
    [name, setName] = useState(library.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await accountRequest(
        account,
        `/v1/admin/libraries/${library.id}`,
        mode === 'rename' ? { name } : undefined,
        mode === 'rename' ? 'PATCH' : 'DELETE',
      );
      setMode(undefined);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-actions">
        <button
          onClick={() => {
            setName(library.name);
            setError('');
            setMode('rename');
          }}
        >
          <Pencil /> Rename
        </button>
        <button
          onClick={() => {
            setError('');
            setMode('delete');
          }}
        >
          <Trash2 /> Delete library
        </button>
      </div>
      {mode && (
        <Modal
          title={mode === 'rename' ? 'Rename library' : 'Delete library?'}
          onClose={() => {
            if (!busy) setMode(undefined);
          }}
        >
          <form
            className="library-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {mode === 'rename' ? (
              <label>
                Library name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            ) : (
              <>
                <p>
                  Delete <strong>{library.name}</strong> and its uploaded server
                  files?
                </p>
                <p className="muted">
                  This removes shared access and stops its folder watches.
                  Watched originals and members’ downloaded books, notes, and
                  reading progress stay intact.
                </p>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="admin-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : mode === 'rename'
                    ? 'Save name'
                    : 'Delete library and server files'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
