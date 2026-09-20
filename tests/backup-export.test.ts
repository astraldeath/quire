import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  backupNeedsSaveGesture,
  exportBackup,
} from '../src/features/backup/export';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { writeNativeFile, deleteNativeFile } from '../src/native-files';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
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
  vi.mocked(isTauri).mockReturnValue(true);
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('ordinary browsers download even when Web Share is supported', async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const share = vi.fn();
  vi.stubGlobal('navigator', {
    userAgent: 'Chrome',
    share,
    canShare: () => true,
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: vi.fn(),
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  expect(backupNeedsSaveGesture()).toBe(false);
  expect(await exportBackup(new Uint8Array([1]))).toBe(true);
  expect(click).toHaveBeenCalledOnce();
  expect(share).not.toHaveBeenCalled();
});
it('iOS share cancellation requires a save gesture and does not report success', async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const share = vi
    .fn()
    .mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
  vi.stubGlobal('navigator', {
    userAgent: 'iPhone',
    share,
    canShare: () => true,
  });
  expect(backupNeedsSaveGesture()).toBe(true);
  expect(await exportBackup(new Uint8Array([1]))).toBe(false);
  expect(share).toHaveBeenCalledOnce();
});
