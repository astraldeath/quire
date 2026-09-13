// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => {
  const database = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8').match(/sql: "([^"]+)"/)![1];
  database.exec(migration);
  return {
    execute: async (query: string, bindings: SQLInputValue[] = []) => database.prepare(query).run(Object.fromEntries(bindings.map((value, index) => [`$${index + 1}`, value]))),
    select: async (query: string, bindings: SQLInputValue[] = []) => database.prepare(query).all(Object.fromEntries(bindings.map((value, index) => [`$${index + 1}`, value]))),
  };
} } }));

it('native SQL statements preserve metadata and roundtrip binary bytes', async () => {
  const storage = await import('../src/storage');
  const book: Book = { id: 'native', title: 'A book', author: '', series: '', volume: null, cover: '', addedAt: 1, local: true };
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
  await storage.putBook(book, bytes);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const updated: Book = { ...book, annotations: [{id:'highlight-1',kind:'highlight',cfi:'epubcfi(/6/2)',text:'A passage',note:'My note',section:'one',createdAt:1,updatedAt:2}], series: 'Manual', position: { cfi: 'epubcfi(/6/2)', fraction: .5, section: 'one', updatedAt: 2 } };
  await storage.saveBook(updated);
  await storage.removeFile(book.id);
  expect(await storage.getFile(book.id)).toBeUndefined();
  expect(await storage.listBooks()).toEqual([{ ...updated, local: false }]);
  await storage.putBook(book, bytes);
  expect(await storage.listBooks()).toEqual([updated]);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const preferences = await storage.loadPreferences();
  preferences.reader.size = 31;
  await storage.savePreferences(preferences);
  expect((await storage.loadPreferences()).reader.size).toBe(31);
});

it('native progress writes preserve already saved notes',async()=>{
 const storage=await import('../src/storage');const book:Book={id:'note-progress',title:'Book',author:'',series:'',volume:null,cover:'',addedAt:0,local:true};await storage.putBook(book,new Uint8Array([1]));
 const notes:NonNullable<Book['annotations']>=[{id:'note',kind:'highlight',cfi:'epubcfi(/6/2)',text:'Word',note:'Saved note',section:'one',createdAt:0,updatedAt:0}];
 await storage.saveBookAnnotations(book.id,notes);
 await storage.saveReadingPosition(book.id,{cfi:'epubcfi(/6/4)',fraction:.4,section:'two',updatedAt:1});
 expect((await storage.listBooks()).find(b=>b.id===book.id)?.annotations).toEqual(notes);
 await storage.removeFile(book.id);await storage.putBook(book,new Uint8Array([1]));
 expect((await storage.listBooks()).find(b=>b.id===book.id)?.annotations).toEqual(notes);
});

it('restores a batch with one SQLite statement and preserves missing file bytes',async()=>{
 const s=await import('../src/storage');const book:Book={id:'restore-existing',title:'Before',author:'',series:'',volume:null,cover:'',addedAt:1,local:true};await s.putBook(book,new Uint8Array([4]));
 await s.restoreBooks([{book:{...book,title:'After'}},{book:{...book,id:'restore-new'},file:new Uint8Array([5])}]);
 expect(await s.getFile(book.id)).toEqual(new Uint8Array([4]));expect((await s.listBooks()).find(b=>b.id===book.id)?.title).toBe('After');expect(await s.getFile('restore-new')).toEqual(new Uint8Array([5]));
});

it('rolls back an entire native restore batch if a record cannot be stored',async()=>{
 const s=await import('../src/storage');const book:Book={id:'rollback-existing',title:'Before',author:'',series:'',volume:null,cover:'',addedAt:1,local:false};await s.saveBook(book);
 await expect(s.restoreBooks([{book:{...book,title:'After'}},{book:{...book,id:null as unknown as string}}])).rejects.toThrow();
 expect((await s.listBooks()).find(b=>b.id===book.id)?.title).toBe('Before');
});

it('deletes selected native book records and bytes only',async()=>{
 const s=await import('../src/storage');const b:Book={id:'delete-me',title:'Delete',author:'',series:'',volume:null,cover:'',addedAt:0,local:true};await s.putBook(b,new Uint8Array([1]));await s.putBook({...b,id:'keep-me'},new Uint8Array([2]));await s.deleteBooks([b.id]);expect((await s.listBooks()).some(x=>x.id===b.id)).toBe(false);expect(await s.getFile(b.id)).toBeUndefined();expect(await s.getFile('keep-me')).toEqual(new Uint8Array([2]));
});
