import { publicationVisibility } from './visibility';
export interface RsvpToken {
  text: string;
  startNode: Text;
  start: number;
  endNode: Text;
  end: number;
  sentence: number;
  paragraphEnd: boolean;
}
const blocks = /^(?:p|div|section|article|h[1-6]|li|blockquote|br|hr|tr)$/i;
const excluded = /^(?:script|style|nav|rt|rp|noscript|template|svg|math)$/i;
export function tokenizeRsvp(
  doc: Document,
  locale?: string,
  styles: string[] = [],
): RsvpToken[] {
  const tokens: RsvpToken[] = [];
  let sentence = 0;
  let nodes: Text[] = [];
  const visibility = publicationVisibility(doc, styles);
  let words: Intl.Segmenter | undefined;
  let sentences: Intl.Segmenter | undefined;
  if (typeof Intl.Segmenter === 'function') {
    try {
      words = new Intl.Segmenter(locale, { granularity: 'word' });
      sentences = new Intl.Segmenter(locale, { granularity: 'sentence' });
    } catch {
      words = new Intl.Segmenter(undefined, { granularity: 'word' });
      sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    }
  }
  const flush = () => {
    const text = nodes.map((n) => n.data).join('');
    if (!text.trim()) {
      nodes = [];
      return;
    }
    const offsets: number[] = [];
    let offset = 0;
    for (const node of nodes) {
      offsets.push(offset);
      offset += node.length;
    }
    const boundary = (position: number, end = false) => {
      for (let i = 0; i < nodes.length; i++) {
        if (
          position < offsets[i] + nodes[i].length ||
          (end && position === offsets[i] + nodes[i].length)
        )
          return { node: nodes[i], offset: position - offsets[i] };
      }
      return {
        node: nodes[nodes.length - 1],
        offset: nodes[nodes.length - 1].length,
      };
    };
    const spans: { start: number; end: number }[] = [];
    if (words) {
      let prefix = -1;
      for (const part of words.segment(text)) {
        if (/^\s+$/u.test(part.segment)) {
          prefix = -1;
          continue;
        }
        const end = part.index + part.segment.length;
        if (
          part.isWordLike ||
          /\p{Extended_Pictographic}/u.test(part.segment)
        ) {
          spans.push({ start: prefix >= 0 ? prefix : part.index, end });
          prefix = -1;
        } else if (
          spans.length &&
          !/\s/u.test(text.slice(spans.at(-1)!.end, part.index))
        ) {
          spans.at(-1)!.end = end;
        } else if (prefix < 0) prefix = part.index;
      }
    } else {
      for (const match of text.matchAll(/\S+/gu))
        spans.push({ start: match.index, end: match.index + match[0].length });
    }
    const boundaries = sentences
      ? [...sentences.segment(text)].map(
          (s) => s.index + s.segment.trimEnd().length,
        )
      : [...text.matchAll(/[.!?。！？]+(?:["'”’)]*)\s*/gu)].map(
          (m) => m.index + m[0].trimEnd().length,
        );
    // ICU treats honorifics followed by capitals as sentence boundaries.
    // Preserve common title abbreviations so rewind includes the person's name.
    const sentenceEnds = boundaries.filter(
      (end) => !/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.$/i.test(text.slice(0, end)),
    );
    let sentenceIndex = 0;
    for (const span of spans) {
      while (
        sentenceIndex < sentenceEnds.length &&
        span.start >= sentenceEnds[sentenceIndex]
      ) {
        sentenceIndex++;
        sentence++;
      }
      const start = boundary(span.start);
      const end = boundary(span.end, true);
      tokens.push({
        text: text.slice(span.start, span.end),
        startNode: start.node,
        start: start.offset,
        endNode: end.node,
        end: end.offset,
        sentence,
        paragraphEnd: false,
      });
    }
    if (spans.length) {
      tokens.at(-1)!.paragraphEnd = true;
      sentence++;
    }
    nodes = [];
  };
  const walk = (node: Node, inheritedHidden = false) => {
    if (node.nodeType === 3) {
      if (!inheritedHidden) nodes.push(node as Text);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (
      excluded.test(element.localName) ||
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      /(?:^|\s)(?:toc|page-list|landmarks)(?:\s|$)/.test(
        element.getAttribute('epub:type') ?? '',
      )
    )
      return;
    const computed = visibility(element);
    if (computed.display === 'none') return;
    const hidden =
      computed.visibility === 'visible'
        ? false
        : computed.visibility === 'hidden' ||
          computed.visibility === 'collapse' ||
          inheritedHidden;
    const block = blocks.test(element.localName);
    if (block) flush();
    for (const child of element.childNodes) walk(child, hidden);
    if (block) flush();
  };
  walk(doc.body ?? doc.documentElement);
  flush();
  return tokens;
}
export function tokenRange(token: RsvpToken): Range {
  const range = token.startNode.ownerDocument.createRange();
  range.setStart(token.startNode, token.start);
  range.setEnd(token.endNode, token.end);
  return range;
}
export function tokenAtRange(tokens: RsvpToken[], range: Range): number {
  for (let i = 0; i < tokens.length; i++) {
    const candidate = tokenRange(tokens[i]);
    if (candidate.comparePoint(range.startContainer, range.startOffset) <= 0) {
      // An endpoint is also the start of the next token when no whitespace intervenes.
      if (
        range.startContainer === tokens[i].endNode &&
        range.startOffset === tokens[i].end &&
        i + 1 < tokens.length
      )
        continue;
      return i;
    }
  }
  return Math.max(0, tokens.length - 1);
}
