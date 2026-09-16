import { BookStorageActions } from '../storage/BookStorageActions';
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
} from 'lucide-react';
import { Modal } from '../../components/Modal';
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
}: {
  onDownload?: () => Promise<void>;
  onMark?: (finished: boolean) => Promise<void>;
  onContinue?: () => void;
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
  const [tracking, setTracking] = useState(false);
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
  const Container = confirm ? Modal : ActionPopover;
  return (
    <Container
      anchor={anchor}
      title={
        confirm
          ? confirm === 'download'
            ? 'Remove download?'
            : 'Remove from library?'
          : entry.series
            ? 'Series actions'
            : 'Book actions'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="book-actions">
        <div className="book-action-title">
          <strong>{entry.title}</strong>
          {entry.series && (
            <span className="muted">{entry.books.length} books</span>
          )}
        </div>
        {confirm ? (
          <>
            <p>
              {confirm === 'download'
                ? 'Book details, progress, bookmarks, highlights, and notes stay in your library.'
                : `This deletes ${entry.series ? `all ${entry.books.length} books in this series and their` : 'this book and its'} downloads, progress, bookmarks, highlights, and notes from Quire on this device.`}
            </p>
            {confirm === 'library' && (
              <p className="muted">
                Original EPUB files and exported backups are kept.
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
          </>
        ) : (
          <div className="book-action-list">
            <button onClick={onOpen}>
              {entry.series ? <FolderOpen /> : <BookOpen />}
              {entry.series
                ? 'Open series'
                : entry.books[0].local
                  ? 'Read book'
                  : 'Download and read'}
            </button>
            {entry.series && onContinue && (
              <button onClick={onContinue}>
                <BookOpen />
                Continue reading
              </button>
            )}
            {onDownload && entry.books.some((b) => !b.local) && (
              <button disabled={busy} onClick={() => void run(onDownload)}>
                <Download />
                Download {entry.series ? `${entry.books.length} books` : 'book'}
              </button>
            )}
            {onMark && (
              <>
                {entry.books.some(
                  (b) => (b.position?.fraction ?? 0) < 0.999,
                ) && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => onMark(true))}
                  >
                    <Check />
                    Mark finished
                  </button>
                )}
                {entry.books.some((b) => !!b.position) && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => onMark(false))}
                  >
                    <BookOpen />
                    Mark unread
                  </button>
                )}
              </>
            )}
            <BookStorageActions books={entry.books} onClose={onClose} />
            {!entry.series && (
              <ExportBookAction book={entry.books[0]} onClose={onClose} />
            )}
            <TrackingButton
              bookId={entry.books[0].id}
              series={entry.series ? entry.title : undefined}
              onClick={() => (onTracking ? onTracking() : setTracking(true))}
            />
            {!entry.series && (
              <button onClick={onDetails}>
                <Info />
                Book details
              </button>
            )}
            {entry.books.some((b) => b.local) && (
              <button onClick={() => setConfirm('download')}>
                <HardDriveDownload />
                Remove download
              </button>
            )}
            <button className="danger" onClick={() => setConfirm('library')}>
              <Trash2 />
              Remove from library
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Container>
  );
}
