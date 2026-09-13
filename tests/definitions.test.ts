import {afterEach,expect,it,vi} from 'vitest';
import {lookupDefinition,parseDefinitions,wiktionaryUrl} from '../src/features/reader/definitions';
afterEach(()=>vi.unstubAllGlobals());
it('extracts English senses without examples, markup or other languages',()=>{
 const html='<h2 id="English">English</h2><h3 id="Noun">Noun</h3><ol><li>The <b>first</b> letter.<dl><dd>Example</dd></dl><script>bad()</script></li></ol><h2 id="French">French</h2><h3>Noun</h3><ol><li>Wrong language</li></ol>';
 expect(parseDefinitions(html)).toEqual([{partOfSpeech:'Noun',senses:['The first letter.']}]);
});
it('handles wrapped headings and multiple parts of speech',()=>{expect(parseDefinitions('<div><h2 id="English">English</h2></div><div><h3 id="Verb">Verb</h3></div><ol><li>To begin.</li></ol>')).toEqual([{partOfSpeech:'Verb',senses:['To begin.']}]);});
it('fetches definitions directly and reports missing entries',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({error:{code:'missingtitle'}})}));
 await expect(lookupDefinition('alpha',new AbortController().signal)).rejects.toThrow('No English definition');
});
it('reports network failure',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));await expect(lookupDefinition('alpha',new AbortController().signal)).rejects.toThrow('connection');});
it('encodes source links and rejects paragraphs',()=>{expect(new URL(wiktionaryUrl('a/b?#')).pathname).toBe('/wiki/a%2Fb%3F%23');expect(()=>wiktionaryUrl('This is a whole paragraph selection')).toThrow('Select a word');});
