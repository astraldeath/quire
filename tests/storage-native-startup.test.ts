// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const { prepare, load } = vi.hoisted(() => ({
  prepare: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: prepare,
}));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load } }));

beforeEach(() => {
  vi.resetModules();
  prepare.mockReset().mockResolvedValue(undefined);
  load.mockReset().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) });
});

it('retries preparation failures before opening the database', async () => {
  prepare.mockRejectedValueOnce(new Error('Database is busy'));
  const { listBooks } = await import('../src/storage');
  await expect(listBooks()).rejects.toThrow('Database is busy');
  expect(load).not.toHaveBeenCalled();
  await expect(listBooks()).resolves.toEqual([]);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenCalledTimes(1);
});

it('retains migration validation failures across repeated access', async () => {
  load.mockRejectedValueOnce(new Error('Migration checksum mismatch'));
  const { listBooks } = await import('../src/storage');
  await expect(listBooks()).rejects.toThrow('Migration checksum mismatch');
  await expect(listBooks()).rejects.toThrow('Migration checksum mismatch');
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
});
