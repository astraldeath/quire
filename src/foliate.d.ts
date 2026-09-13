declare module 'foliate-js/epub.js' {
  export interface TocItem { label: string; href: string; subitems?: TocItem[] }
  export class EPUB {
    constructor(loader: { loadText(name: string): Promise<string | null>; loadBlob(name: string): Promise<Blob | null>; getSize(name: string): number; sha1?: (text: string) => Promise<Uint8Array> });
    init(): Promise<EPUB>;
    toc?: TocItem[];
    destroy(): void;
  }
}
declare module 'foliate-js/view.js' {
  import type { EPUB } from 'foliate-js/epub.js';
  export class View extends HTMLElement {
    renderer: HTMLElement & { getContents(): {doc: Document; index: number}[]; setStyles(css: string): void; goTo(target: unknown): Promise<void>; containerPosition: number; scrollBy(dx: number, dy: number): void; snap(vx: number, vy: number): void; start: number; end: number; viewSize: number; atStart: boolean; atEnd: boolean };
    getCFI(index: number, range?: Range): string;
    addAnnotation(annotation: {value: string}): Promise<unknown>;
    deleteAnnotation(annotation: {value: string}): Promise<unknown>;
    search(options: {query: string}): AsyncGenerator<{subitems?: {cfi: string; excerpt: {pre: string; match: string; post: string}}[]} | string>;
    clearSearch(): void;
    open(book: EPUB): Promise<void>;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    resolveNavigation(target: string | number): unknown;
    goTo(target: string | number): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    close(): void;
  }
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer { static highlight(rects: unknown, options?: unknown): SVGElement; }
}
