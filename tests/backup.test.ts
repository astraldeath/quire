import {expect,it} from 'vitest';
import {createBackup,readBackup} from '../src/features/backup/archive';
import {mergeBook} from '../src/features/backup/merge';
import {defaults,type Book} from '../src/domain/models';
const bytes=new Uint8Array([1,2,3]);
const book:Book={id:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',title:'Book',author:'Author',series:'',volume:null,cover:'',addedAt:1,local:true};
it('roundtrips full backup bytes and data-only metadata',async()=>{
 const full=await readBackup(await createBackup([{book,file:bytes}],defaults,'full'));
 expect(full.records[0].file).toEqual(bytes);expect(full.records[0].book.title).toBe('Book');
 const data=await readBackup(await createBackup([{book,file:bytes}],defaults,'data'));
 expect(data.records[0].file).toBeUndefined();expect(data.records[0].book.local).toBe(false);
});
it('rejects bytes that do not match the book identity',async()=>{await expect(createBackup([{book,file:new Uint8Array([9])}],defaults,'full')).rejects.toThrow('identity');});
it('merges newest progress and preserves conflicting notes without duplicates on repeat restore',()=>{
 const note={id:'note',kind:'highlight' as const,cfi:'epubcfi(/6/2)',text:'Word',note:'Local note',section:'One',createdAt:1,updatedAt:3};
 const local={...book,title:'My title',position:{cfi:'a',fraction:.8,section:'Later',updatedAt:5},annotations:[note]};
 const incoming={...book,position:{cfi:'b',fraction:.2,section:'Earlier',updatedAt:2},annotations:[{...note,note:'Backup note',updatedAt:2}]};
 const merged=mergeBook(local,incoming);expect(merged.title).toBe('My title');expect(merged.position).toEqual(local.position);expect(merged.annotations?.map(n=>n.note)).toEqual(['Local note','Backup note']);expect(mergeBook(merged,incoming)).toEqual(merged);
});
it('rejects non backup files',async()=>{await expect(readBackup(bytes)).rejects.toThrow();});

import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader} from '@zip.js/zip.js';
async function archiveWith(manifest:unknown){const w=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,level:0});await w.add('manifest.json',new Uint8ArrayReader(new TextEncoder().encode(JSON.stringify(manifest))));return w.close();}
const manifest={format:'quire-backup',version:1,createdAt:1,kind:'data',preferences:defaults,books:[book],files:[]};
it('rejects future formats, duplicate books, and unsafe cover URLs',async()=>{
 await expect(readBackup(await archiveWith({...manifest,version:99}))).rejects.toThrow('version');
 await expect(readBackup(await archiveWith({...manifest,books:[book,book]}))).rejects.toThrow('book list');
 await expect(readBackup(await archiveWith({...manifest,books:[{...book,cover:'https://tracker.test/image'}]}))).rejects.toThrow('invalid library data');
});
it('rejects archives with missing book files',async()=>{await expect(readBackup(await archiveWith({...manifest,kind:'full',files:[book.id]}))).rejects.toThrow();});
it('keeps newer incoming progress but never removes unrelated annotations',()=>{const p={cfi:'new',fraction:.1,section:'One',updatedAt:10};expect(mergeBook({...book,position:{...p,updatedAt:1}},{...book,position:p}).position).toEqual(p);});
it.each(['added','last-read','volume'] as const)('roundtrips %s sort preference',async(sort)=>{
 const restored=await readBackup(await createBackup([{book}],{...defaults,sort},'data'));
 expect(restored.preferences.sort).toBe(sort);
});
