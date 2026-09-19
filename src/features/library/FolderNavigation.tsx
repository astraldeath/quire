import { useRef, useState } from 'react';
import { ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
import { Modal } from '../../components/Modal';

export function FolderNavigation({
  path,
  href,
  onOpen,
  onRename,
  onDelete,
}: {
  path: string;
  href?: (path: string) => string;
  onOpen(path: string): void;
  onRename(): void;
  onDelete(): Promise<void>;
}) {
  const [anchor, setAnchor] = useState<ActionAnchor | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const parts = path.split('/');
  const crumbs = [
    { name: 'Library', path: '' },
    ...parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join('/'),
    })),
  ];
  return (
    <div className="folder-navigation">
      <nav aria-label="Folder breadcrumbs" className="folder-breadcrumbs">
        <ol>
          {crumbs.map((crumb, i) => (
            <li key={crumb.path}>
              {i > 0 && <ChevronRight aria-hidden="true" />}
              {i === crumbs.length - 1 ? (
                <span aria-current="page">{crumb.name}</span>
              ) : href ? (
                <a
                  href={href(crumb.path)}
                  onClick={(event) => {
                    if (
                      event.button ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.altKey ||
                      event.shiftKey
                    )
                      return;
                    event.preventDefault();
                    onOpen(crumb.path);
                  }}
                >
                  {crumb.name}
                </a>
              ) : (
                <button onClick={() => onOpen(crumb.path)}>{crumb.name}</button>
              )}
            </li>
          ))}
        </ol>
        <button
          className="icon"
          aria-label="Folder actions"
          aria-haspopup="menu"
          onClick={(event) =>
            setAnchor(event.currentTarget.getBoundingClientRect())
          }
        >
          <Ellipsis />
        </button>
      </nav>
      {anchor && (
        <ActionPopover
          title="Folder actions"
          anchor={anchor}
          onClose={() => setAnchor(null)}
        >
          <div className="book-action-list">
            <button
              onClick={() => {
                setAnchor(null);
                onRename();
              }}
            >
              <Pencil />
              Rename folder
            </button>
            <button
              className="danger"
              onClick={() => {
                setAnchor(null);
                setError('');
                setConfirm(true);
              }}
            >
              <Trash2 />
              Delete folder
            </button>
          </div>
        </ActionPopover>
      )}
      {confirm && (
        <Modal
          title="Delete folder?"
          onClose={() => {
            if (!saving.current) setConfirm(false);
          }}
        >
          <form
            className="settings-body"
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving.current) return;
              saving.current = true;
              setBusy(true);
              setError('');
              try {
                await onDelete();
                setConfirm(false);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not delete folder.',
                );
              } finally {
                saving.current = false;
                setBusy(false);
              }
            }}
          >
            <p>
              Delete “{parts.at(-1)}” and its subfolders? Books and reading
              progress stay in your library. Other folder memberships stay
              unchanged.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button className="danger" disabled={busy}>
                {busy ? 'Deleting…' : 'Delete folder'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
