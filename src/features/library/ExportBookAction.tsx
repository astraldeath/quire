import { TaskError } from '../../components/TaskError';
import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Book } from '../../domain/models';
import { BookExportError, exportEpub } from './epub-export';
import { ActionMenuItem } from '../../components/ActionMenuItem';

export function ExportBookAction({
  book,
  onClose,
}: {
  book: Book;
  onClose(): void;
}) {
  const format = (book.format ?? 'epub').toUpperCase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      if (await exportEpub(book)) onClose();
    } catch (error) {
      setError(
        (error instanceof BookExportError ? error.stage === 'save' : book.local)
          ? 'Could not export the book. Check device storage and try again.'
          : 'Could not download the book for export. Check your server connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ActionMenuItem
        menuId="export"
        disabled={busy}
        onClick={() => void run()}
        aria-busy={busy}
      >
        <Download />
        {busy
          ? book.local
            ? `Exporting ${format}…`
            : `Downloading ${format}…`
          : `Export ${format}`}
      </ActionMenuItem>
      {error && (
        <TaskError
          summary={error}
          detail=""
          onRetry={() => void run()}
          busy={busy}
        />
      )}
    </>
  );
}
