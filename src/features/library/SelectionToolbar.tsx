import { useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Ellipsis,
  FolderInput,
  Shield,
  Trash2,
} from 'lucide-react';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
import { ActionMenuItem } from '../../components/ActionMenuItem';
import { PrivacyMenu } from '../privacy/PrivacyMenu';

export function SelectionToolbar({
  selectedIds,
  totalEligible,
  busy,
  onSelectAll,
  onDone,
  onFolders,
  onDownload,
  onMarkFinished,
  onMarkUnread,
  onRemove,
}: {
  selectedIds: string[];
  totalEligible: number;
  busy: boolean;
  onSelectAll(): void;
  onDone(): void;
  onFolders(origin: HTMLElement): void;
  onDownload(): void;
  onMarkFinished(): void;
  onMarkUnread(): void;
  onRemove(): void;
}) {
  const [menu, setMenu] = useState<'main' | 'privacy' | null>(null);
  const [anchor, setAnchor] = useState<ActionAnchor>();
  const count = selectedIds.length;
  const run = (action: () => void) => {
    setMenu(null);
    action();
  };
  return (
    <div className="selection-bar" role="region" aria-label="Selected books">
      <strong>{count} selected</strong>
      <button type="button" disabled={!totalEligible} onClick={onSelectAll}>
        {count === totalEligible && totalEligible > 0
          ? 'Deselect all'
          : 'Select all'}
      </button>
      {count > 0 && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => onFolders(event.currentTarget)}
          >
            <FolderInput />
            Folders
          </button>
          <button
            type="button"
            disabled={busy}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setAnchor({
                left: rect.left,
                top: rect.top,
                bottom: rect.bottom,
                element: event.currentTarget,
              });
              setMenu('main');
            }}
          >
            <Ellipsis />
            More actions
          </button>
        </>
      )}
      <button type="button" onClick={onDone}>
        Done
      </button>
      {menu && (
        <ActionPopover
          title="Selection actions"
          anchor={anchor}
          pageKey={menu}
          initialItem={menu === 'privacy' ? 'normal' : 'download'}
          onClose={() => setMenu(null)}
        >
          {menu === 'privacy' ? (
            <PrivacyMenu
              initialOpen
              ids={selectedIds}
              onBack={() => setMenu('main')}
              onDone={() => setMenu(null)}
            />
          ) : (
            <div className="book-action-list">
              <ActionMenuItem menuId="download" onClick={() => run(onDownload)}>
                <Download />
                Download
              </ActionMenuItem>
              <ActionMenuItem
                menuId="finished"
                onClick={() => run(onMarkFinished)}
              >
                <Check />
                Mark finished
              </ActionMenuItem>
              <ActionMenuItem menuId="unread" onClick={() => run(onMarkUnread)}>
                <BookOpen />
                Mark unread
              </ActionMenuItem>
              <ActionMenuItem
                menuId="privacy"
                onClick={() => setMenu('privacy')}
              >
                <Shield />
                Privacy
              </ActionMenuItem>
              <div className="menu-divider" role="separator" />
              <ActionMenuItem
                menuId="remove"
                className="danger"
                onClick={() => run(onRemove)}
              >
                <Trash2 />
                Remove
              </ActionMenuItem>
            </div>
          )}
        </ActionPopover>
      )}
    </div>
  );
}
