import { invoke, isTauri } from '@tauri-apps/api/core';
import { ensureBookFile } from '../sync/library';
import { withSystemDialog } from '../privacy/inactive';

export function epubFilename(title: string): string {
  let stem = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.epub$/i, '')
    .replace(/^[. ]+|[. ]+$/g, '');
  // Bound UTF-8 bytes as well as characters for filesystem portability.
  const encoder = new TextEncoder();
  while (encoder.encode(stem).length > 180)
    stem = Array.from(stem).slice(0, -1).join('');
  stem = stem.replace(/[. ]+$/g, '') || 'Book';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))
    stem = `Book ${stem}`;
  return `${stem}.epub`;
}

/** Export the original EPUB, including fetching server-only books on demand. */
export async function exportEpub(book: {
  id: string;
  title: string;
}): Promise<boolean> {
  const bytes = await ensureBookFile(book.id);
  const name = epubFilename(book.title);
  if (isTauri()) {
    const encoded = btoa(
      String.fromCharCode(...new TextEncoder().encode(name)),
    );
    return withSystemDialog(() =>
      invoke<boolean>('export_epub', bytes, {
        headers: { 'x-quire-filename': encoded },
      }),
    );
  }
  const file = new File([bytes.slice().buffer], name, {
    type: 'application/epub+zip',
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
