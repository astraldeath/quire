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
    renderer: HTMLElement & { setStyles(css: string): void; start: number; end: number; viewSize: number; atStart: boolean; atEnd: boolean };
    open(book: EPUB): Promise<void>;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    close(): void;
  }
}
