import { BOOK_MIME, type BookFormat } from '../../books';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ensureBookFile } from '../sync/library';
import { withSystemDialog } from '../privacy/inactive';
import { getNativeFileReference } from '../../storage';

export function epubFilename(
  title: string,
  format: BookFormat = 'epub',
): string {
  let stem = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.(epub|cbz|cbr|cb7|fb2|fbz|mobi|azw3|pdf|fb2\.zip)$/i, '')
    .replace(/^[. ]+|[. ]+$/g, '');
  // Bound UTF-8 bytes as well as characters for filesystem portability.
  const encoder = new TextEncoder();
  while (encoder.encode(stem).length > 180)
    stem = Array.from(stem).slice(0, -1).join('');
  stem = stem.replace(/[. ]+$/g, '') || 'Book';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))
    stem = `Book ${stem}`;
  return `${stem}.${format}`;
}

export class BookExportError extends Error {
  constructor(
    readonly stage: 'download' | 'save',
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : 'Book export failed.');
  }
}
export async function exportEpub(book: {
  id: string;
  title: string;
  format?: BookFormat;
  local?: boolean;
}): Promise<boolean> {
  try {
    return await exportOriginal(book);
  } catch (error) {
    throw error instanceof BookExportError
      ? error
      : new BookExportError('save', error);
  }
}
async function exportFile(book: { id: string; local?: boolean }) {
  try {
    return await ensureBookFile(book.id);
  } catch (error) {
    throw new BookExportError(book.local ? 'save' : 'download', error);
  }
}
/** Export the original book, including fetching server-only books on demand. */
async function exportOriginal(book: {
  id: string;
  title: string;
  format?: BookFormat;
  local?: boolean;
}): Promise<boolean> {
  const name = epubFilename(book.title, book.format);
  if (isTauri()) {
    const encoded = btoa(
      String.fromCharCode(...new TextEncoder().encode(name)),
    );
    const reference = await getNativeFileReference(book.id);
    if (reference)
      return withSystemDialog(() =>
        invoke<boolean>('export_epub', undefined, {
          headers: {
            'x-quire-filename': encoded,
            'x-quire-file-reference': reference,
          },
        }),
      );
    const bytes = await exportFile(book);
    return withSystemDialog(() =>
      invoke<boolean>('export_epub', bytes, {
        headers: { 'x-quire-filename': encoded },
      }),
    );
  }
  const bytes = await exportFile(book);
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, {
    type: BOOK_MIME[book.format ?? 'epub'],
  });
  // A network download may consume transient activation. Fall back to download
  // when sharing cannot be started, but treat a dismissed share sheet normally.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await withSystemDialog(() => navigator.share({ files: [file] }));
      return true;
    } catch (error) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? error.name
          : undefined;
      if (name === 'AbortError') return false;
      if (name !== 'NotAllowedError') throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
}
