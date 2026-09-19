import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
interface PendingFile {
  id: string;
  name: string;
  size: number;
  error?: string | null;
}
export async function readDesktopFile(entry: PendingFile): Promise<File> {
  if (entry.error) throw new Error(entry.error);
  if (!Number.isSafeInteger(entry.size) || entry.size <= 0)
    throw new Error('Invalid book size.');
  const parts: ArrayBuffer[] = [];
  for (let offset = 0; offset < entry.size; offset += 1024 * 1024) {
    const length = Math.min(1024 * 1024, entry.size - offset);
    const bytes = await invoke<ArrayBuffer>('desktop_open_read', {
      id: entry.id,
      offset,
      length,
    });
    if (bytes.byteLength !== length)
      throw new Error('The book file changed while opening.');
    parts.push(bytes);
  }
  return new File(parts, entry.name);
}
export function startDesktopOpen(
  onFile: (file: File) => Promise<void>,
  onError: (error: unknown) => void,
  ready: () => boolean,
) {
  if (!isTauri() || import.meta.env.VITE_HOSTED === 'true') return () => {};
  let stopped = false,
    running = false,
    dirty = true;
  const drain = async () => {
    if (stopped || running || !dirty || !ready()) return;
    running = true;
    dirty = false;
    try {
      const pending = await invoke<PendingFile[]>('desktop_open_pending');
      for (const entry of pending) {
        if (stopped || !ready()) {
          dirty = true;
          break;
        }
        let handled = false;
        try {
          const file = await readDesktopFile(entry);
          if (stopped) break;
          handled = true;
          await onFile(file);
        } catch (error) {
          handled = true;
          if (!stopped) onError(error);
        } finally {
          if (handled) await invoke('desktop_open_release', { id: entry.id });
        }
      }
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      running = false;
    }
  };
  let unlisten: (() => void) | undefined;
  void listen('desktop-open-files', () => {
    dirty = true;
    void drain();
  })
    .then((stop) => {
      if (stopped) stop();
      else {
        unlisten = stop;
        void drain();
      }
    })
    .catch((error) => {
      if (!stopped) onError(error);
    });
  // A launch request waits while imports or initial library loading are active.
  const timer = setInterval(() => void drain(), 500);
  return () => {
    stopped = true;
    clearInterval(timer);
    unlisten?.();
  };
}
