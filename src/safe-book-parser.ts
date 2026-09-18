import { sanitizeDocument } from './epub';

/** Never activate source HTML while a format parser builds its document. */
export class SafeBookParser {
  parseFromString(source: string, type: DOMParserSupportedType): Document {
    if (type === 'application/xml') {
      if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source))
        throw new Error('Unsupported XML entities.');
      return new DOMParser().parseFromString(source, type);
    }
    // Preserve generated local resources and Kindle internal navigation through
    // the common sanitizer; remote URLs remain forbidden.
    const locals: string[] = [];
    source = source.replace(
      /((?:src|href)\s*=\s*)(["'])(blob:[^"']*|data:image\/(?:png|jpeg|gif|webp|bmp|avif);base64,[^"']*|(?:kindle|filepos):[^"']*)\2/gi,
      (_, attr, quote, value) => {
        locals.push(value);
        return `${attr}${quote}quire-local-${locals.length - 1}${quote}`;
      },
    );
    let safe: string;
    try {
      safe = sanitizeDocument(source, type === 'text/html');
    } catch (error) {
      // Kindle HTML is often tagged XHTML without being well-formed XML.
      if (
        type !== 'application/xhtml+xml' ||
        /<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)
      )
        throw error;
      safe = sanitizeDocument(source, true);
    }
    const doc = new DOMParser().parseFromString(safe, 'application/xhtml+xml');
    for (const el of doc.querySelectorAll('[src], [href]'))
      for (const attr of ['src', 'href']) {
        const match = /^quire-local-(\d+)$/.exec(el.getAttribute(attr) ?? '');
        if (match && locals[Number(match[1])])
          el.setAttribute(attr, locals[Number(match[1])]);
      }
    return doc;
  }
}
