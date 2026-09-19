import { beforeEach, expect, it, vi } from 'vitest';
import { exportBackup } from '../src/features/backup/export';
import { invoke } from '@tauri-apps/api/core';
import { writeNativeFile, deleteNativeFile } from '../src/native-files';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
vi.mock('../src/native-files', () => ({
  writeNativeFile: vi.fn(),
  deleteNativeFile: vi.fn(),
}));
vi.mock('../src/features/privacy/inactive', () => ({
  withSystemDialog: (work: () => Promise<unknown>) => work(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writeNativeFile).mockResolvedValue('@quire-file:' + 'a'.repeat(64));
  vi.mocked(deleteNativeFile).mockResolvedValue(undefined);
});

it.each([true, false])(
  'exports a staged file and cleans it up after picker result %s',
  async (result) => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    vi.mocked(invoke).mockResolvedValue(result);
    await expect(exportBackup(blob)).resolves.toBe(result);
    expect(writeNativeFile).toHaveBeenCalledWith(blob);
    expect(invoke).toHaveBeenCalledWith('export_backup', {
      reference: '@quire-file:' + 'a'.repeat(64),
    });
    expect(deleteNativeFile).toHaveBeenCalledWith(
      '@quire-file:' + 'a'.repeat(64),
    );
  },
);

it('cleans up the staged archive when export fails', async () => {
  vi.mocked(invoke).mockRejectedValue(new Error('Disk full'));
  await expect(exportBackup(new Uint8Array([1]))).rejects.toThrow('Disk full');
  expect(deleteNativeFile).toHaveBeenCalledTimes(1);
});
