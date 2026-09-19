import { invoke } from '@tauri-apps/api/core';

const prefix = '@quire-file:';
export const nativeChunkSize = 1024 * 1024;
export function nativeFileId(value: string): string | undefined {
  if (!value.startsWith(prefix)) return undefined;
  const id = value.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Invalid stored book file.');
  return id;
}

export async function writeNativeFile(
  bytes: Uint8Array | Blob,
): Promise<string> {
  const id = await invoke<string>('book_file_begin');
  try {
    const size = bytes instanceof Blob ? bytes.size : bytes.byteLength;
    for (let offset = 0; offset < size; offset += nativeChunkSize) {
      const chunk =
        bytes instanceof Blob
          ? new Uint8Array(
              await bytes.slice(offset, offset + nativeChunkSize).arrayBuffer(),
            )
          : bytes.subarray(offset, offset + nativeChunkSize);
      await invoke('book_file_append', chunk, {
        headers: { 'x-quire-file': id, 'x-quire-offset': String(offset) },
      });
    }
    await invoke('book_file_finish', { id, size });
    return prefix + id;
  } catch (error) {
    await invoke('book_file_abort', { id }).catch(() => {});
    throw error;
  }
}

export async function readNativeFile(id: string): Promise<Uint8Array> {
  const size = await invoke<number>('book_file_size', { id });
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('Invalid book size.');
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += nativeChunkSize) {
    const chunk = new Uint8Array(
      await invoke<ArrayBuffer>('book_file_read', {
        id,
        offset,
        length: Math.min(nativeChunkSize, size - offset),
      }),
    );
    if (chunk.byteLength !== Math.min(nativeChunkSize, size - offset))
      throw new Error('Incomplete stored book file.');
    bytes.set(chunk, offset);
  }
  return bytes;
}

export async function deleteNativeFile(reference: string): Promise<void> {
  const id = nativeFileId(reference);
  if (id) await invoke('book_file_remove', { id });
}
