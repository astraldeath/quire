import { invoke, isTauri } from '@tauri-apps/api/core';
import { withSystemDialog } from '../privacy/inactive';
export async function exportBackup(bytes: Uint8Array): Promise<boolean> {
  if (isTauri())
    return withSystemDialog(() => invoke<boolean>('export_backup', bytes));
  const name = `quire-${new Date().toISOString().replace(/[:.]/g, '-')}.quire-backup`;
  const file = new File([bytes.slice().buffer], name, {
    type: 'application/zip',
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await withSystemDialog(() => navigator.share({ files: [file] }));
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
