import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';
import { defaults, type Book } from './domain/models';
import { saveReadingPosition, saveBookAnnotations, getFile, listBooks, loadPreferences, putBook, removeFile, saveBook, savePreferences } from './storage';

describe('durable library lifecycle', () => {
  it('retains organization and resume data after removal and identical reimport', async () => {
    const book: Book = { id: 'sha256-fixture', title: 'Original', author: 'Quire', series: '', volume: null, cover: '', addedAt: 123, local: true };
    const bytes = new Uint8Array([0, 128, 255, 1]);
    await putBook(book, bytes);
    expect(Array.from((await getFile(book.id))!)).toEqual(Array.from(bytes));
    const edited: Book = { ...book, annotations:[{id:'note-1',kind:'highlight',cfi:'epubcfi(/6/2!/4)',text:'Saved passage',note:'Remember this',section:'chapter1',createdAt:123,updatedAt:456}], series: 'My series', volume: 2, position: { cfi: 'epubcfi(/6/2!/4)', section: 'chapter1', fraction: .42, updatedAt: 456 } };
    await saveBook(edited);
    await removeFile(book.id);
    expect(await getFile(book.id)).toBeUndefined();
    expect((await listBooks()).find(b => b.id === book.id)).toEqual({ ...edited, local: false });
    // A late metadata save cannot recreate local availability.
    await saveBook(edited);
    expect((await listBooks()).find(b => b.id === book.id)?.local).toBe(false);
    await putBook({ ...book, title: 'Reimport metadata' }, bytes);
    expect(Array.from((await getFile(book.id))!)).toEqual(Array.from(bytes));
    expect((await listBooks()).find(b => b.id === book.id)).toEqual(edited);
    const independentConnection = await openDB('quire-library', 1);
    expect((await independentConnection.get('books', book.id)).metadata.annotations).toEqual(edited.annotations);
    independentConnection.close();
  });

  it('merges new defaults into persisted partial reader preferences', async () => {
    await savePreferences({ ...defaults, theme: 'dark', reader: { ...defaults.reader, size: 27 } });
    expect((await loadPreferences()).reader.size).toBe(27);
    const connection = await openDB('quire-library', 1);
    await connection.put('preferences', { theme: 'light', reader: { size: 25 } }, 'device');
    connection.close();
    expect(await loadPreferences()).toEqual({ ...defaults, theme: 'light', reader: { ...defaults.reader, size: 25 } });
    const loaded = await loadPreferences();
    loaded.reader.size = 99;
    expect(defaults.reader.size).not.toBe(99);
  });
});

it('browser progress updates preserve saved notes across an independent connection',async()=>{
 const book:Book={id:'note-progress',title:'Book',author:'',series:'',volume:null,cover:'',addedAt:0,local:true};await putBook(book,new Uint8Array([1]));
 const notes:NonNullable<Book['annotations']>=[{id:'note',kind:'highlight',cfi:'epubcfi(/6/2)',text:'Word',note:'Saved note',section:'one',createdAt:0,updatedAt:0}];
 await saveBookAnnotations(book.id,notes);await saveReadingPosition(book.id,{cfi:'epubcfi(/6/4)',fraction:.4,section:'two',updatedAt:1});
 const connection=await openDB('quire-library',1);expect((await connection.get('books',book.id)).metadata.annotations).toEqual(notes);connection.close();
});
