import {
  getDocument,
  GlobalWorkerOptions,
  AnnotationMode,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ReaderBook } from './books';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(bytes: Uint8Array): Promise<ReaderBook> {
  // PDF.js transfers the buffer to its worker; keep the original for import/export.
  const task = getDocument({
    data: bytes.slice(),
    cMapUrl: new URL(
      `${import.meta.env.BASE_URL}assets/pdfjs/cmaps/`,
      location.href,
    ).href,
    cMapPacked: true,
    wasmUrl: new URL(
      `${import.meta.env.BASE_URL}assets/pdfjs/wasm/`,
      location.href,
    ).href,
    iccUrl: new URL(
      `${import.meta.env.BASE_URL}assets/pdfjs/iccs/`,
      location.href,
    ).href,
    standardFontDataUrl: new URL(
      `${import.meta.env.BASE_URL}assets/pdfjs/standard_fonts/`,
      location.href,
    ).href,
    useWasm: false,
    enableXfa: false,
  });
  let document;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy();
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error(
        'This PDF is password-protected. Import an unlocked copy.',
      );
    throw new Error('Could not open this PDF. The file may be damaged.');
  }
  if (!document.numPages) {
    await task.destroy();
    throw new Error('This PDF has no pages.');
  }
  let destroyed = false;
  const render = async (index: number, signal?: AbortSignal, cover = false) => {
    signal?.throwIfAborted();
    if (destroyed) throw new Error('PDF is closed.');
    const page = await document.getPage(index + 1);
    signal?.throwIfAborted();
    const original = page.getViewport({ scale: 1 });
    const width = cover
      ? 400
      : Math.min(
          2400,
          Math.max(
            1200,
            window.innerWidth * Math.min(devicePixelRatio || 1, 2),
          ),
        );
    const scale = Math.min(
      width / original.width,
      3200 / Math.max(original.width, original.height),
      Math.sqrt(4_000_000 / (original.width * original.height)),
    );
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const rendering = page.render({
      canvas,
      viewport,
      annotationMode: AnnotationMode.DISABLE,
    });
    const cancel = () => rendering.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await rendering.promise;
      signal?.throwIfAborted();
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('Could not render PDF page.')),
          'image/png',
        ),
      );
    } finally {
      signal?.removeEventListener('abort', cancel);
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
  };
  const pages = Array.from({ length: document.numPages }, (_, index) => ({
    name: `pdf-page-${index + 1}`,
    blob: (signal?: AbortSignal) => render(index, signal),
  }));
  const metadata = await document.getMetadata().catch(() => null);
  const info = metadata?.info as
    { Title?: string; Author?: string } | undefined;
  return {
    metadata: {
      title: typeof info?.Title === 'string' ? info.Title.trim() : undefined,
      author: typeof info?.Author === 'string' ? info.Author.trim() : undefined,
    },
    comicPages: pages,
    toc: pages.map((page, index) => ({
      label: `Page ${index + 1}`,
      href: page.name,
    })),
    getCover: () => render(0, undefined, true),
    destroy() {
      destroyed = true;
      void task.destroy();
    },
  };
}
