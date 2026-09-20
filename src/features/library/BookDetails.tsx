import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, HardDriveDownload, Pencil, Trash2 } from 'lucide-react';
import type { Book } from '../../domain/models';
import { readingStatusLabel } from '../../domain/library';
import { Modal } from '../../components/Modal';
import { TaskError } from '../../components/TaskError';
import { useDraftGuard } from '../../components/useDraftGuard';
import { BookServerActions } from '../sync/BookServerActions';
import { TrackingDialog } from '../tracking/TrackingDialog';
import { TrackingButton } from '../tracking/TrackingButton';
import './book-details.css';

function sameMetadata(a: Book, b: Book) {
  return (
    a.title === b.title &&
    a.author === b.author &&
    a.series === b.series &&
    a.volume === b.volume
  );
}

function savedMetadata(book: Book): Book {
  return {
    ...book,
    title: book.title.trim(),
    author: book.author.trim(),
    series: book.series.trim(),
  };
}

export function BookDetails({
  book,
  onClose,
  onSave,
  onRemove,
  onRead,
  onImport,
  onDelete,
  onTracking,
  remoteAvailable,
  privacyLabel,
}: {
  book: Book;
  onClose: () => void;
  onSave: (b: Book) => Promise<void>;
  onRemove: () => Promise<void>;
  onRead: () => void;
  onImport: () => void;
  onDelete: () => void;
  onTracking?: () => void;
  remoteAvailable?: boolean;
  privacyLabel?: string;
}) {
  const [tracking, setTracking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState(book);
  const [draft, setDraft] = useState(book);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const dirty = editing && !sameMetadata(draft, baseline);
  const draftGuard = useDraftGuard({ dirty, busy });

  useEffect(() => {
    if (!editing) {
      setBaseline(book);
      setDraft(book);
    }
  }, [book, editing]);

  const leaveEdit = () => {
    setDraft(baseline);
    setEditing(false);
    setError('');
  };
  const save = async () => {
    const next = savedMetadata(draft);
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      setBaseline(next);
      setDraft(next);
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The details could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  };
  const removeDownload = async () => {
    setBusy(true);
    setError('');
    try {
      await onRemove();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The download could not be removed.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (tracking)
    return <TrackingDialog book={book} onClose={() => setTracking(false)} />;

  return (
    <>
      <Modal
        title={editing ? 'Edit details' : 'Book details'}
        onClose={() => (editing ? draftGuard.requestLeave(onClose) : onClose())}
        initialFocus={editing ? titleInput : editButton}
        focusKey={editing ? 'edit' : 'summary'}
        className="book-details-modal"
      >
        {editing ? (
          <form
            className="book-details-panel book-details-edit"
            onSubmit={(event) => {
              event.preventDefault();
              if (dirty && draft.title.trim()) void save();
            }}
          >
            <div className="form-grid">
              <label className="wide">
                Title
                <input
                  ref={titleInput}
                  name="title"
                  required
                  maxLength={1000}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                Author
                <input
                  name="author"
                  maxLength={1000}
                  value={draft.author}
                  onChange={(event) =>
                    setDraft({ ...draft, author: event.target.value })
                  }
                />
              </label>
              <label>
                Series
                <input
                  name="series"
                  maxLength={1000}
                  value={draft.series}
                  onChange={(event) =>
                    setDraft({ ...draft, series: event.target.value })
                  }
                />
              </label>
              <label>
                Volume
                <input
                  name="volume"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.volume ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      volume:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            {error && (
              <TaskError summary="Could not save details." detail={error} />
            )}
            <footer className="modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => draftGuard.requestLeave(leaveEdit)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !draft.title.trim() || !dirty}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>
        ) : (
          <div className="book-details-panel">
            <div className="details-intro">
              {book.cover && <img src={book.cover} alt="" />}
              <div>
                <h3>{book.title}</h3>
                <p>{book.author || 'Unknown author'}</p>
                {book.series && (
                  <p className="muted">
                    {book.series}
                    {book.volume !== null ? ` · Volume ${book.volume}` : ''}
                  </p>
                )}
                <p className="muted">{readingStatusLabel(book)}</p>
              </div>
            </div>
            <div className="book-details-primary">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={onRead}
              >
                {book.local ? <BookOpen /> : <HardDriveDownload />}
                {book.local ? 'Open book' : 'Download and read'}
              </button>
              <button
                ref={editButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  setBaseline(book);
                  setDraft(book);
                  setError('');
                  setEditing(true);
                }}
              >
                <Pencil />
                Edit details
              </button>
            </div>
            {error && (
              <TaskError summary="Could not remove download." detail={error} />
            )}
            <section className="book-details-group" aria-label="Availability">
              <h3>Availability</h3>
              <p className="muted book-details-availability">
                {book.local
                  ? remoteAvailable === false
                    ? 'Downloaded only to this device.'
                    : 'Downloaded for offline reading on this device.'
                  : remoteAvailable
                    ? 'Stored on your server and downloaded when opened.'
                    : 'Not downloaded to this device.'}
              </p>
              {privacyLabel && (
                <p className="muted book-details-availability">
                  {privacyLabel} Access is unlocked for this session.
                </p>
              )}
              <div className="book-details-actions">
                {book.local ? (
                  <button
                    type="button"
                    className="text-action"
                    disabled={busy || confirm}
                    onClick={() => setConfirm(true)}
                  >
                    <HardDriveDownload />
                    Remove download
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-action"
                    onClick={onImport}
                  >
                    <HardDriveDownload />
                    Import book file
                  </button>
                )}
              </div>
              {confirm && (
                <div className="removal">
                  <p>
                    Remove the downloaded book file? Book details, progress,
                    bookmarks, highlights, and notes stay in your library.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      Keep download
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => void removeDownload()}
                    >
                      Remove download
                    </button>
                  </div>
                </div>
              )}
              <BookServerActions book={book} />
            </section>
            {(import.meta.env.VITE_HOSTED === 'true' || isTauri()) && (
              <div className="book-details-action-row">
                <div>
                  <strong>Tracking</strong>
                  <span className="muted">
                    Manage this book’s tracker link.
                  </span>
                </div>
                <TrackingButton
                  bookId={book.id}
                  onClick={() =>
                    onTracking ? onTracking() : setTracking(true)
                  }
                />
              </div>
            )}
            <div className="book-details-remove">
              <button
                type="button"
                className="text-action danger"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 />
                Remove from library
              </button>
            </div>
          </div>
        )}
      </Modal>
      {draftGuard.confirmation}
    </>
  );
}
