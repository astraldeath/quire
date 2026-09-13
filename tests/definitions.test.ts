import { afterEach, expect, it, vi } from 'vitest';
import { lookupDefinition } from '../src/features/reader/definitions';
afterEach(()=>vi.unstubAllGlobals());
it('requests only the encoded selected term and returns definitions',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>[{meanings:[{partOfSpeech:'noun',definitions:[{definition:'A written work.',example:'Read a book.'}]}]}]});vi.stubGlobal('fetch',fetcher);
 expect(await lookupDefinition('book')).toEqual([{part:'noun',text:'A written work.',example:'Read a book.'}]);
 expect(fetcher).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/book',expect.objectContaining({credentials:'omit',referrerPolicy:'no-referrer'}));
});
it('rejects long selections before sending anything',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(lookupDefinition('This is a whole paragraph selection')).rejects.toThrow('Select a word');expect(fetcher).not.toHaveBeenCalled();});
it('distinguishes a missing word from an unavailable service',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:404,ok:false}));await expect(lookupDefinition('missing')).rejects.toThrow('No English definition');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:503,ok:false}));await expect(lookupDefinition('book')).rejects.toThrow('unavailable');});
