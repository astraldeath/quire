import { describe, expect, it } from 'vitest';
import { sanitizeDocument } from './epub';

describe('EPUB document sanitization', () => {
  it('removes an empty doctype subset before parsing XHTML', () => {
    const source = `<?xml version="1.0"?><!DOCTYPE html []><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Test</title></head><body><p>Readable chapter</p></body></html>`;

    const sanitized = sanitizeDocument(source);

    expect(sanitized).toContain('Readable chapter');
    expect(sanitized).not.toContain('<!DOCTYPE');
  });

  it('rejects entity declarations in EPUB XML', () => {
    const source = `<!DOCTYPE html [<!ENTITY secret "blocked">]><html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>&secret;</p></body></html>`;

    expect(() => sanitizeDocument(source)).toThrow(
      'EPUB XML contains unsupported document entities.',
    );
  });
});
