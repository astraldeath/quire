import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Book } from '../../domain/models';
import { exportEpub } from './epub-export';

export function ExportBookAction({
  book,
  onClose,
}: {
  book: Book;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      if (await exportEpub(book)) onClose();
    } catch {
      setError('Could not export EPUB. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button disabled={busy} onClick={() => void run()} aria-busy={busy}>
        <Download />
        {busy
          ? book.local
            ? 'Exporting EPUB…'
            : 'Downloading EPUB…'
          : 'Export EPUB'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
