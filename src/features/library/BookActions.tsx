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
  LibraryBig,
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
  CloudUpload,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { ActionMenuItem } from '../../components/ActionMenuItem';
import {
  readingStatus,
  readingStatusLabel,
  type LibraryEntry,
} from '../../domain/library';
import { removalDescription } from './removal';
import { useRemovalScope } from './useRemovalScope';
export function BookActions({
  entry,
  inSeries = false,
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
  onAdd,
  onUpload,
  uploadCount,
  remoteAvailable,
}: {
  onUpload?: () => void;
  uploadCount?: number;
  remoteAvailable?: boolean;
  onDownload?: () => Promise<void>;
  onMark?: (finished: boolean) => Promise<void>;
  onContinue?: () => void;
  onMove?: () => void;
  onAdd?: () => Promise<void>;
  onTracking?: () => void;
  entry: LibraryEntry;
  inSeries?: boolean;
  anchor?: ActionAnchor;
  initialRemove?: boolean;
  onClose(): void;
  onOpen(): void;
  onDetails(): void;
  onRemoveDownload(): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [submenu, setSubmenu] = useState<'files' | null>(null);
  const [tracking, setTracking] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<string>();
  const [confirm, setConfirm] = useState<'library' | 'download' | null>(
    initialRemove ? 'library' : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const removal = useRemovalScope(confirm === 'library');
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
              ? `${remoteAvailable === true ? 'You can download the files again from your server.' : remoteAvailable === false ? "You'll need to import the files again to read these books." : 'Server copies have not been verified. You may need to import the files again to read these books.'} Book details, progress, bookmarks, highlights, and notes stay in your library.`
              : removal.connected === null
                ? 'Checking removal scope…'
                : removalDescription(removal.connected, entry.books.length)}
          </p>
          {confirm === 'library' && removal.error && (
            <p role="alert">{removal.error}</p>
          )}
          <div className="button-row">
            <button disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={
                busy || (confirm === 'library' && removal.connected === null)
              }
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
            Files and downloads
          </ActionMenuItem>
          <div className="menu-divider" role="separator" />
          {onDownload && entry.books.some((b) => !b.local) && (
            <ActionMenuItem
              menuId="download"
              disabled={busy}
              onClick={() => void run(onDownload)}
            >
              <Download />
              Download {entry.series ? `${entry.books.length} books` : 'book'}
            </ActionMenuItem>
          )}
          <BookStorageActions
            books={entry.books}
            onClose={onClose}
            hideUpload={!!onUpload}
          />
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
            {!entry.series && (
              <span className="muted">
                {readingStatusLabel(entry.books[0])}
              </span>
            )}
          </div>
          <div className="book-action-list">
            {onAdd && (
              <ActionMenuItem
                menuId="add"
                disabled={busy}
                onClick={() => void run(onAdd)}
              >
                <LibraryBig />
                Add to library
              </ActionMenuItem>
            )}
            {!(entry.series && inSeries) && (
              <ActionMenuItem menuId="open" onClick={onOpen}>
                {entry.series ? <FolderOpen /> : <BookOpen />}
                {entry.series
                  ? 'Open series'
                  : entry.books[0].local
                    ? 'Read book'
                    : 'Download and read'}
              </ActionMenuItem>
            )}
            {entry.series && onContinue && (
              <ActionMenuItem menuId="continue" onClick={onContinue}>
                <BookOpen />
                {entry.books.some((book) => readingStatus(book) !== 'unread')
                  ? 'Continue reading'
                  : 'Start reading'}
              </ActionMenuItem>
            )}
            <TrackingButton
              bookId={entry.books[0].id}
              series={entry.series ? entry.title : undefined}
              onClick={() => (onTracking ? onTracking() : setTracking(true))}
            />
            {onUpload && uploadCount !== 0 && (
              <ActionMenuItem menuId="upload" onClick={onUpload}>
                <CloudUpload />
                {entry.series ? 'Upload series' : 'Upload to server'}
                {uploadCount !== undefined ? ` (${uploadCount})` : ''}
              </ActionMenuItem>
            )}
            {!entry.series && (
              <ActionMenuItem menuId="details" onClick={onDetails}>
                <Info />
                Book details
              </ActionMenuItem>
            )}
            {onMark &&
              entry.books.some(
                (book) => readingStatus(book) !== 'finished',
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
            {onMark &&
              entry.books.some((book) => readingStatus(book) !== 'unread') && (
                <ActionMenuItem
                  menuId="mark-unread"
                  disabled={busy}
                  onClick={() => void run(() => onMark(false))}
                >
                  <BookOpen />
                  Mark unread
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
            {entry.books.some((b) => b.inLibrary !== false) && (
              <ActionMenuItem
                menuId="remove"
                className="danger"
                onClick={() => setConfirm('library')}
              >
                <Trash2 />
                Remove from library
              </ActionMenuItem>
            )}
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
