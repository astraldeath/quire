import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
it('marks multiple books without losing files, metadata, or notes and queues unread removal',async()=>{
 const s=await import('../src/storage');s.useBrowserAccount('status-test');
 await s.syncTransaction(state=>{state.account={origin:'http://test',username:'test',sessionId:'test'};return {result:undefined};});
 const ids=['a'.repeat(64),'b'.repeat(64)];
 for(const id of ids)await s.putBook({id,title:'Book',author:'Author',series:'Series',volume:1,cover:'',addedAt:1,local:true,annotations:[{id:'note',kind:'highlight',cfi:'epubcfi(/6/2)',text:'Quote',note:'Keep',section:'',createdAt:1,updatedAt:1}]},new Uint8Array([1,2]));
 await s.markBooksRead(ids,true);expect((await s.listBooks()).every(b=>b.position?.fraction===1)).toBe(true);
 await s.markBooksRead(ids,false);for(const b of await s.listBooks()){expect(b.position).toBeUndefined();expect(b.annotations?.[0].note).toBe('Keep');expect(b.author).toBe('Author');expect(Array.from((await s.getFile(b.id))!)).toEqual([1,2]);}
 expect((await s.loadSync()).pending.filter(p=>p.kind==='position').every(p=>p.deleted)).toBe(true);
});
