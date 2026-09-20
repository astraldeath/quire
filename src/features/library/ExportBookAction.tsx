import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Book } from '../../domain/models';
import { exportEpub } from './epub-export';
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
    } catch {
      setError(
        'Could not export the book. Check your connection and try again.',
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
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
