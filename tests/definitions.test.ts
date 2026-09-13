import {expect,it} from 'vitest';
import {wiktionaryUrl} from '../src/features/reader/definitions';
it('embeds a mobile Wiktionary entry on its own origin',()=>{expect(wiktionaryUrl(' alpha ')).toBe('https://en.wiktionary.org/wiki/alpha?useskin=minerva#English');});
it('encodes input so it cannot change the host or URL parameters',()=>{const url=new URL(wiktionaryUrl('a/b?#'));expect(url.origin).toBe('https://en.wiktionary.org');expect(url.pathname).toBe('/wiki/a%2Fb%3F%23');expect(url.search).toBe('?useskin=minerva');});
it('rejects whole paragraphs',()=>{expect(()=>wiktionaryUrl('This is a whole paragraph selection')).toThrow('Select a word');});
