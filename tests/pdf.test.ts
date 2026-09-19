import { afterEach, expect, it, vi } from 'vitest';
import { openPdf } from '../src/pdf';
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  page: vi.fn(),
  destroy: vi.fn(),
  render: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  AnnotationMode: { DISABLE: 0 },
  getDocument: mock.get,
}));
afterEach(() => vi.restoreAllMocks());
function setup() {
  const doc = {
    numPages: 3,
    getPage: mock.page,
    getMetadata: async () => ({
      info: { Title: 'PDF title', Author: 'An author' },
    }),
  };
  mock.get.mockReturnValue({
    promise: Promise.resolve(doc),
    destroy: mock.destroy,
  });
  mock.page.mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: mock.render,
    cleanup: mock.cleanup,
  });
  mock.render.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    function (callback) {
      callback(new Blob(['image'], { type: 'image/png' }));
    },
  );
}
it('indexes PDF pages without rendering, then renders only requested pages and releases resources', async () => {
  vi.clearAllMocks();
  setup();
  const bytes = new Uint8Array([1, 2, 3]);
  const book = await openPdf(bytes);
  expect(mock.get.mock.calls[0][0].data).not.toBe(bytes);
  expect(mock.get.mock.calls[0][0].useWasm).toBe(false);
  expect(mock.page).not.toHaveBeenCalled();
  expect(book.metadata?.title).toBe('PDF title');
  expect(book.toc).toHaveLength(3);
  const blob = await book.comicPages![1].blob();
  expect(blob.type).toBe('image/png');
  expect(mock.page).toHaveBeenCalledWith(2);
  expect(mock.cleanup).toHaveBeenCalledOnce();
  book.destroy();
  expect(mock.destroy).toHaveBeenCalledOnce();
  await expect(book.comicPages![0].blob()).rejects.toThrow('closed');
});
it('cancels page work without rendering an aborted request', async () => {
  vi.clearAllMocks();
  setup();
  const book = await openPdf(new Uint8Array([1]));
  const controller = new AbortController();
  controller.abort();
  await expect(book.comicPages![0].blob(controller.signal)).rejects.toThrow();
  expect(mock.render).not.toHaveBeenCalled();
  book.destroy();
});
it('explains password-protected PDFs and tears down failed loading', async () => {
  vi.clearAllMocks();
  const error = new Error('password');
  error.name = 'PasswordException';
  mock.get.mockReturnValue({
    promise: Promise.reject(error),
    destroy: mock.destroy,
  });
  await expect(openPdf(new Uint8Array([1]))).rejects.toThrow(
    'password-protected',
  );
  expect(mock.destroy).toHaveBeenCalledOnce();
});
