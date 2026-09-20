import { BookStorageActions } from '../storage/BookStorageActions';
import { PrivacyMenu } from '../privacy/PrivacyMenu';
import { ExportBookAction } from './ExportBookAction';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
import { TrackingDialog } from '../tracking/TrackingDialog';
import { TrackingButton } from '../tracking/TrackingButton';
import { useState } from 'react';
import {
  BookOpen,
  Info,
  Trash2,
  HardDriveDownload,
  FolderOpen,
  Download,
  Check,
  Shield,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { ActionMenuItem } from '../../components/ActionMenuItem';
import type { LibraryEntry } from '../../domain/library';
export function BookActions({
  entry,
  anchor,
  initialRemove = false,
  onClose,
  onOpen,
  onDetails,
  onRemoveDownload,
  onDelete,
  onTracking,
  onDownload,
  onMark,
  onContinue,
  onMove,
}: {
  onDownload?: () => Promise<void>;
  onMark?: (finished: boolean) => Promise<void>;
  onContinue?: () => void;
  onMove?: () => void;
  onTracking?: () => void;
  entry: LibraryEntry;
  anchor?: ActionAnchor;
  initialRemove?: boolean;
  onClose(): void;
  onOpen(): void;
  onDetails(): void;
  onRemoveDownload(): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [submenu, setSubmenu] = useState<'status' | 'files' | null>(null);
  const [tracking, setTracking] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<string>();
  const [confirm, setConfirm] = useState<'library' | 'download' | null>(
    initialRemove ? 'library' : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update the book. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (tracking)
    return (
      <TrackingDialog
        book={entry.books[0]}
        series={entry.series ? entry.title : undefined}
        onClose={onClose}
      />
    );
  if (confirm)
    return (
      <Modal
        title={
          confirm === 'download' ? 'Remove download?' : 'Remove from library?'
        }
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <div className="book-actions">
          <p>
            {confirm === 'download'
              ? 'Book details, progress, bookmarks, highlights, and notes stay in your library.'
              : `This deletes ${entry.series ? `all ${entry.books.length} books in this series and their` : 'this book and its'} downloads, progress, bookmarks, highlights, and notes from Quire on this device.`}
          </p>
          {confirm === 'library' && (
            <p className="muted">
              Original book files and exported backups are kept.
            </p>
          )}
          <div className="button-row">
            <button disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void run(confirm === 'download' ? onRemoveDownload : onDelete)
              }
            >
              <Trash2 />
              {busy
                ? 'Removing…'
                : confirm === 'download'
                  ? 'Remove download'
                  : `Remove ${entry.series ? `${entry.books.length} books` : 'from library'}`}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    );

  const page = privacyOpen ? 'privacy' : (submenu ?? 'main');
  return (
    <ActionPopover
      anchor={anchor}
      pageKey={page}
      initialItem={privacyOpen ? 'normal' : submenu ? 'back' : returnItem}
      title={
        privacyOpen
          ? 'Privacy'
          : submenu === 'files'
            ? 'Files and downloads'
            : submenu === 'status'
              ? 'Reading status'
              : entry.series
                ? 'Series actions'
                : 'Book actions'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {privacyOpen ? (
        <PrivacyMenu
          initialOpen
          ids={entry.books.map((b) => b.id)}
          onBack={() => setPrivacyOpen(false)}
          onDone={onClose}
        />
      ) : submenu ? (
        <div className="book-action-list">
          <ActionMenuItem
            menuId="back"
            className="submenu-back"
            onClick={() => setSubmenu(null)}
          >
            <ArrowLeft />
            {submenu === 'files' ? 'Files and downloads' : 'Reading status'}
          </ActionMenuItem>
          <div className="menu-divider" role="separator" />
          {submenu === 'status' ? (
            onMark && (
              <>
                {entry.books.some(
                  (b) => (b.position?.fraction ?? 0) < 0.999,
                ) && (
                  <ActionMenuItem
                    menuId="mark-finished"
                    disabled={busy}
                    onClick={() => void run(() => onMark(true))}
                  >
                    <Check />
                    Mark finished
                  </ActionMenuItem>
                )}
                {entry.books.some((b) => !!b.position) && (
                  <ActionMenuItem
                    menuId="mark-unread"
                    disabled={busy}
                    onClick={() => void run(() => onMark(false))}
                  >
                    <BookOpen />
                    Mark unread
                  </ActionMenuItem>
                )}
              </>
            )
          ) : (
            <>
              {onDownload && entry.books.some((b) => !b.local) && (
                <ActionMenuItem
                  menuId="download"
                  disabled={busy}
                  onClick={() => void run(onDownload)}
                >
                  <Download />
                  Download{' '}
                  {entry.series ? `${entry.books.length} books` : 'book'}
                </ActionMenuItem>
              )}
              <BookStorageActions books={entry.books} onClose={onClose} />
              {!entry.series && (
                <ExportBookAction book={entry.books[0]} onClose={onClose} />
              )}
              {entry.books.some((b) => b.local) && (
                <ActionMenuItem
                  menuId="remove-download"
                  onClick={() => setConfirm('download')}
                >
                  <HardDriveDownload />
                  Remove download
                </ActionMenuItem>
              )}
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="book-actions">
          <div className="book-action-title">
            <strong>{entry.title}</strong>
            {entry.series && (
              <span className="muted">{entry.books.length} books</span>
            )}
          </div>
          <div className="book-action-list">
            <ActionMenuItem menuId="open" onClick={onOpen}>
              {entry.series ? <FolderOpen /> : <BookOpen />}
              {entry.series
                ? 'Open series'
                : entry.books[0].local
                  ? 'Read book'
                  : 'Download and read'}
            </ActionMenuItem>
            {entry.series && onContinue && (
              <ActionMenuItem menuId="continue" onClick={onContinue}>
                <BookOpen />
                Continue reading
              </ActionMenuItem>
            )}
            <TrackingButton
              bookId={entry.books[0].id}
              series={entry.series ? entry.title : undefined}
              onClick={() => (onTracking ? onTracking() : setTracking(true))}
            />
            {!entry.series && (
              <ActionMenuItem menuId="details" onClick={onDetails}>
                <Info />
                Book details
              </ActionMenuItem>
            )}
            {onMark && (
              <ActionMenuItem
                menuId="status"
                onClick={() => {
                  setReturnItem('status');
                  setSubmenu('status');
                }}
              >
                <Check />
                Reading status
                <ChevronRight className="menu-chevron" />
              </ActionMenuItem>
            )}
            <ActionMenuItem
              menuId="files"
              onClick={() => {
                setReturnItem('files');
                setSubmenu('files');
              }}
            >
              <FolderOpen />
              Files and downloads
              <ChevronRight className="menu-chevron" />
            </ActionMenuItem>
            {onMove && (
              <ActionMenuItem menuId="folders" onClick={onMove}>
                <FolderOpen />
                Folders
              </ActionMenuItem>
            )}
            <ActionMenuItem
              menuId="privacy"
              onClick={() => {
                setReturnItem('privacy');
                setPrivacyOpen(true);
              }}
            >
              <Shield />
              Privacy
              <ChevronRight className="menu-chevron" />
            </ActionMenuItem>
            <div className="menu-divider" role="separator" />
            <ActionMenuItem
              menuId="remove"
              className="danger"
              onClick={() => setConfirm('library')}
            >
              <Trash2 />
              Remove from library
            </ActionMenuItem>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </ActionPopover>
  );
}
