import { beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import {
  eligible,
  readPolicy,
  storageDefaults,
  writePolicy,
} from '../src/features/storage/policy';
import {
  manageStorage,
  protectOpenBook,
  uploadBooks,
} from '../src/features/storage/manager';
const mocks = vi.hoisted(() => ({
  loadSync: vi.fn(),
  listBooks: vi.fn(),
  getFile: vi.fn(),
  removeFileWhen: vi.fn(),
  files: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  syncNow: vi.fn(),
}));
vi.mock('../src/storage', () => mocks);
vi.mock('../src/features/sync/transport', () => mocks);
vi.mock('../src/features/sync/engine', () => mocks);
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'one',
};
const bytes = new Uint8Array([1, 2, 3]);
const book = {
  id: createHash('sha256').update(bytes).digest('hex'),
  title: 'One',
  author: '',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: true,
  position: { cfi: '', section: '', fraction: 1, updatedAt: 1 },
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  protectOpenBook(null);
  vi.stubGlobal('crypto', webcrypto);
  mocks.loadSync.mockResolvedValue({ enabled: true, account });
  mocks.listBooks.mockResolvedValue([book]);
  mocks.getFile.mockResolvedValue(bytes);
  mocks.files.mockResolvedValue([{ bookId: book.id, size: 3, uploaded: true }]);
  mocks.download.mockResolvedValue(bytes);
});
it('defaults to no automatic transfers and keeps settings account-specific', async () => {
  await manageStorage();
  expect(mocks.files).not.toHaveBeenCalled();
  writePolicy(account, { autoUpload: true });
  expect(readPolicy({ ...account, username: 'bob' }).autoUpload).toBe(false);
});
it('protects open, pinned, unfinished and recently used books', () => {
  const policy = { ...storageDefaults, offload: true };
  expect(eligible(book, policy, null)).toBe(true);
  expect(eligible(book, policy, book.id)).toBe(false);
  expect(eligible(book, { ...policy, pinned: [book.id] }, null)).toBe(false);
  expect(eligible({ ...book, position: undefined }, policy, null)).toBe(false);
  expect(
    eligible(book, { ...policy, accessed: { [book.id]: Date.now() } }, null),
  ).toBe(false);
});
it('uploads existing local books only when enabled and skips server copies', async () => {
  writePolicy(account, { autoUpload: true });
  await manageStorage();
  expect(mocks.upload).not.toHaveBeenCalled();
  mocks.files.mockResolvedValue([]);
  await manageStorage();
  expect(mocks.upload).toHaveBeenCalledWith(account, book.id, bytes);
});
it('rejects account changes before uploading', async () => {
  mocks.syncNow.mockImplementation(async () =>
    mocks.loadSync.mockResolvedValue({
      enabled: true,
      account: { ...account, username: 'bob' },
    }),
  );
  await expect(uploadBooks([book.id])).rejects.toThrow('account changed');
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('keeps files when the server copy is missing or fails verification', async () => {
  writePolicy(account, { offload: true });
  mocks.files.mockResolvedValue([]);
  await manageStorage();
  expect(mocks.download).not.toHaveBeenCalled();
  mocks.files.mockResolvedValue([{ bookId: book.id }]);
  mocks.download.mockResolvedValue(new Uint8Array([9]));
  await manageStorage();
  expect(mocks.removeFileWhen).not.toHaveBeenCalled();
  mocks.download.mockRejectedValue(new Error('missing'));
  await manageStorage();
  expect(mocks.removeFileWhen).not.toHaveBeenCalled();
});
it('rechecks pins, activity and account inside removal after verifying bytes', async () => {
  writePolicy(account, { offload: true });
  await manageStorage();
  expect(mocks.removeFileWhen).toHaveBeenCalledTimes(1);
  const guard = mocks.removeFileWhen.mock.calls[0][1];
  expect(await guard(book, { enabled: true, account })).toBe(true);
  expect(await guard(book, { enabled: false, account })).toBe(false);
  expect(
    await guard(book, {
      enabled: true,
      account: { ...account, sessionId: 'new' },
    }),
  ).toBe(false);
  protectOpenBook(book.id);
  expect(await guard(book, { enabled: true, account })).toBe(false);
  protectOpenBook(null);
  writePolicy(account, { pinned: [book.id] });
  expect(await guard(book, { enabled: true, account })).toBe(false);
});
it('keeps eligible downloads when usage is below the optional limit', async () => {
  writePolicy(account, { offload: true, maxMB: 128 });
  await manageStorage();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('moves past a persistently failing upload on the next pass', async () => {
  writePolicy(account, { autoUpload: true });
  mocks.files.mockResolvedValue([]);
  const first = { ...book, id: 'failing-upload' },
    second = { ...book, id: 'healthy-upload' };
  mocks.listBooks.mockResolvedValue([first, second]);
  mocks.upload
    .mockRejectedValueOnce(new Error('too large'))
    .mockResolvedValue(undefined);
  await manageStorage();
  await manageStorage();
  expect(mocks.upload.mock.calls.map((call) => call[1])).toEqual([
    first.id,
    second.id,
  ]);
});
it('moves past a missing watched file on the next pass', async () => {
  writePolicy(account, { offload: true });
  const missing = { ...book, id: 'missing-file' };
  mocks.listBooks.mockResolvedValue([missing, book]);
  mocks.files.mockResolvedValue([{ bookId: missing.id }, { bookId: book.id }]);
  mocks.download
    .mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValue(bytes);
  await manageStorage();
  await manageStorage();
  expect(mocks.removeFileWhen).toHaveBeenCalledWith(
    book.id,
    expect.any(Function),
  );
});

it('continues offloading when an unrelated upload fails', async () => {
  writePolicy(account, { autoUpload: true, offload: true });
  mocks.listBooks.mockResolvedValue([{ ...book, id: 'upload-failure' }, book]);
  mocks.upload.mockRejectedValue(new Error('upload rejected'));
  await manageStorage();
  expect(mocks.removeFileWhen).toHaveBeenCalledWith(
    book.id,
    expect.any(Function),
  );
});
