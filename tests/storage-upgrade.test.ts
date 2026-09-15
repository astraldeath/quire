import 'fake-indexeddb/auto';
import {openDB} from 'idb';
import {expect,it,vi} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
it('moves existing EPUB bytes out of metadata atomically and preserves notes and preferences',async()=>{
 const name='quire-account-upgrade-fixture';const old=await openDB(name,1,{upgrade(db){db.createObjectStore('books',{keyPath:'id'});db.createObjectStore('preferences');}});
 const metadata={id:'saved',title:'Keep',author:'',series:'',volume:null,cover:'',addedAt:1,local:false,annotations:[{note:'Important'}]};
 await old.put('books',{id:'saved',metadata,file:new Uint8Array([1,2,3])});await old.put('books',{id:'remote',metadata:{...metadata,id:'remote'}});await old.put('preferences',{sort:'title'},'device');old.close();
 const s=await import('../src/storage');s.useBrowserAccount('upgrade-fixture');expect((await s.listBooks()).find(b=>b.id==='saved')).toMatchObject({local:true,annotations:metadata.annotations});expect((await s.listBooks()).find(b=>b.id==='remote')?.local).toBe(false);expect(Array.from((await s.getFile('saved'))!)).toEqual([1,2,3]);expect((await s.loadPreferences()).sort).toBe('title');
 const db=await openDB(name);expect((await db.get('books','saved')).file).toBeUndefined();expect(Array.from(await db.get('files','saved'))).toEqual([1,2,3]);
 await s.saveBook({...metadata,annotations:[],local:true});expect(Array.from((await s.getFile('saved'))!)).toEqual([1,2,3]);await s.removeFile('saved');expect(await s.getFile('saved')).toBeUndefined();expect((await s.listBooks()).find(b=>b.id==='saved')?.local).toBe(false);db.close();
});
