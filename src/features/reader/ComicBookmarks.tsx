import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Trash2, X } from 'lucide-react';
import type { Annotation, Book, Position } from '../../domain/models';
import { ReaderDialog } from './ReaderDialog';
import { comicPageAt } from './comic-navigation';

export function ComicBookmarks({
  book,
  position,
  count,
  toolbar,
  visible,
  otherPanelOpen,
  onOpen,
  onSave,
  navigate,
}: {
  book: Book;
  position?: Position;
  count: number;
  toolbar: HTMLElement;
  visible: boolean;
  otherPanelOpen: boolean;
  onOpen(): void;
  onSave(items: Annotation[]): Promise<void>;
  navigate(cfi: string): Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(book.annotations ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => setItems(book.annotations ?? []), [book.annotations]);
  useEffect(() => {
    if (otherPanelOpen) setOpen(false);
  }, [otherPanelOpen]);
  const marked =
    position &&
    items.find(
      (item) =>
        item.kind === 'bookmark' &&
        comicPageAt({ cfi: item.cfi, fraction: 0 }, count) ===
          comicPageAt(position, count),
    );
  const persist = async (next: Annotation[]) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      setItems(next);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save bookmarks.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      {visible &&
        !open &&
        createPortal(
          <div className="reader-tools" aria-label="Reading tools">
            <button
              title="Bookmarks"
              aria-label="Bookmarks"
              onClick={() => {
                onOpen();
                setError('');
                setOpen(true);
              }}
            >
              <Bookmark />
            </button>
          </div>,
          toolbar,
        )}
      {open && (
        <ReaderDialog label="Bookmarks" onClose={() => setOpen(false)}>
          <div className="reader-panel-heading">
            <h2>Bookmarks</h2>
            <button aria-label="Close bookmarks" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="saved-annotations">
            <button
              className="bookmark-current"
              disabled={busy || !position}
              onClick={() => {
                if (!position) return;
                void persist(
                  marked
                    ? items.filter((item) => item.id !== marked.id)
                    : [
                        ...items,
                        {
                          id: crypto.randomUUID(),
                          kind: 'bookmark',
                          cfi: position.cfi,
                          text: position.section || book.title,
                          note: '',
                          section: position.section,
                          createdAt: Date.now(),
                          updatedAt: Date.now(),
                        },
                      ],
                );
              }}
            >
              <Bookmark fill={marked ? 'currentColor' : 'none'} />
              {marked ? 'Remove bookmark' : 'Bookmark this page'}
            </button>
            {!items.length && <p>No bookmarks yet.</p>}
            {items.map((item) => (
              <article key={item.id}>
                <button
                  className="annotation-jump"
                  onClick={() => {
                    void navigate(item.cfi).then((ok) => {
                      if (ok) setOpen(false);
                      else setError('Could not open this bookmark.');
                    });
                  }}
                >
                  <Bookmark />
                  <span>
                    {item.text || item.section}
                    {item.note && <small>{item.note}</small>}
                  </span>
                </button>
                <div>
                  <button
                    aria-label="Delete bookmark"
                    disabled={busy}
                    onClick={() =>
                      void persist(
                        items.filter((entry) => entry.id !== item.id),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </ReaderDialog>
      )}
    </>
  );
}
