import { useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Ellipsis,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
import { Modal } from '../../components/Modal';
import { ActionMenuItem } from '../../components/ActionMenuItem';

export function FolderNavigation({
  path,
  count,
  childCount = 0,
  focusKey,
  onFocused,
  href,
  onOpen,
  onNewFolder,
  onRename,
  onDelete,
}: {
  path: string;
  count: number;
  childCount?: number;
  focusKey?: string;
  onFocused?(): void;
  href?: (path: string) => string;
  onOpen(path: string): void;
  onNewFolder(origin?: HTMLElement): void;
  onRename(): void;
  onDelete(): Promise<void>;
}) {
  const [anchor, setAnchor] = useState<ActionAnchor | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const parts = path.split('/');
  const countText = [
    count ? `${count} ${count === 1 ? 'book' : 'books'}` : '',
    childCount
      ? `${childCount} ${childCount === 1 ? 'folder' : 'folders'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const ancestors = [
    { name: 'Library', path: '' },
    ...parts.slice(0, -1).map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join('/'),
    })),
  ];
  useLayoutEffect(() => {
    if (focusKey !== path || !heading.current) return;
    heading.current.focus({ preventScroll: true });
    if (document.activeElement === heading.current) onFocused?.();
  }, [focusKey, onFocused, path]);
  return (
    <div className="folder-navigation">
      <nav aria-label="Folder breadcrumbs" className="folder-breadcrumbs">
        <ol>
          {ancestors.map((crumb, index) => (
            <li key={crumb.path || ':root'}>
              {index > 0 && <ChevronRight aria-hidden="true" />}
              {href ? (
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
                <button type="button" onClick={() => onOpen(crumb.path)}>
                  {crumb.name}
                </button>
              )}
            </li>
          ))}
          <li className="folder-current">
            <ChevronRight aria-hidden="true" />
            <h1 ref={heading} tabIndex={-1} aria-current="page">
              {parts.at(-1)}
            </h1>
            {countText && <span className="folder-count">{countText}</span>}
          </li>
        </ol>
        <button
          type="button"
          className="icon"
          aria-label="Folder actions"
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setAnchor({
              left: rect.left,
              top: rect.top,
              bottom: rect.bottom,
              element: event.currentTarget,
            });
          }}
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
            <ActionMenuItem
              menuId="new-folder"
              onClick={() => {
                const origin = anchor?.element;
                setAnchor(null);
                onNewFolder(origin);
              }}
            >
              <FolderPlus />
              New folder
            </ActionMenuItem>
            <ActionMenuItem
              menuId="rename"
              onClick={() => {
                setAnchor(null);
                onRename();
              }}
            >
              <Pencil />
              Rename folder
            </ActionMenuItem>
            <ActionMenuItem
              menuId="delete"
              className="danger"
              onClick={() => {
                setAnchor(null);
                setError('');
                setConfirm(true);
              }}
            >
              <Trash2 />
              Delete folder
            </ActionMenuItem>
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
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
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
