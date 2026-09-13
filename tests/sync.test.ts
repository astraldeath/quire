import {describe,it,expect} from 'vitest';
import {emptySync,queueChanges,prepareBatch,acceptResponse,type SyncState} from '../src/features/sync/model';
import type {Book} from '../src/domain/models';
const book:Book={id:'a'.repeat(64),title:'Book',author:'',series:'',volume:null,cover:'',addedAt:0,local:true};
function state():SyncState{return {...emptySync(),account:{origin:'https://books.example',username:'alice',sessionId:'session'}};}
describe('durable sync outbox',()=>{
 it('coalesces unsent edits but preserves an in-flight retry and rebases the next edit',()=>{
 const s=state();queueChanges(s,undefined,book);const batch=prepareBatch(s);const first=batch.operations[0];queueChanges(s,book,{...book,title:'Edited'});expect(s.pending).toHaveLength(2);expect(prepareBatch(s).operations).toEqual(batch.operations);
 acceptResponse(s,{results:[{id:first.id,revision:1,conflict:false}],changes:[],cursor:0,hasMore:false});expect(s.pending).toHaveLength(1);expect(s.pending[0].baseRevision).toBe(1);expect(s.pending[0].value).toMatchObject({title:'Edited'});
 });
 it('retains remote conflicts and queues annotation tombstones',()=>{
 const s=state();const note={id:'n',kind:'highlight' as const,cfi:'epubcfi(/6/2)',text:'word',note:'note',section:'one',createdAt:0,updatedAt:0};queueChanges(s,{...book,annotations:[note]},{...book,annotations:[]});expect(s.pending[0]).toMatchObject({kind:'annotation',deleted:true,value:null});
 const rec={bookId:book.id,kind:'annotation' as const,recordId:'n',revision:2,candidates:[{operationId:'a',deleted:false,value:{kind:'highlight',cfi:note.cfi,text:'word',note:'first',section:'one'},createdAt:1},{operationId:'b',deleted:true,value:null,createdAt:2}]};acceptResponse(s,{results:[],changes:[{...rec,cursor:1}],cursor:1,hasMore:false});expect(Object.values(s.records)[0].candidates).toHaveLength(2);
 });
 it('does not enqueue local download removal or timestamps',()=>{const s=state();queueChanges(s,book,{...book,local:false,addedAt:9});expect(s.pending).toEqual([]);});
});
it('keeps a just-acknowledged local value until its change page arrives',async()=>{
 const {applyRecords}=await import('../src/features/sync/model');const s=state();s.records[`${book.id}/book/default`]={bookId:book.id,kind:'book',recordId:'default',revision:1,candidates:[{operationId:'old',deleted:false,value:{title:'Old',author:'',series:'',volume:null},createdAt:1}]};queueChanges(s,{...book,title:'Old'},book);const batch=prepareBatch(s);acceptResponse(s,{results:[{id:batch.operations[0].id,revision:2,conflict:false}],changes:[],cursor:0,hasMore:false});expect(applyRecords(s,[book])[0].title).toBe('Book');
});
it('ordinary edits cannot silently resolve a known conflict',()=>{const s=state();s.records[`${book.id}/book/default`]={bookId:book.id,kind:'book',recordId:'default',revision:2,candidates:[{operationId:'a',deleted:false,value:{title:'A'},createdAt:1},{operationId:'b',deleted:false,value:{title:'B'},createdAt:2}]};queueChanges(s,book,{...book,title:'Edit'});expect(s.pending[0].baseRevision).toBeLessThan(2);});
it('resolution sends only operation fields, never remote record internals',async()=>{const {queueValue}=await import('../src/features/sync/model');const s=state();const record={bookId:book.id,kind:'book' as const,recordId:'default',revision:2,candidates:[{operationId:'a',deleted:false,value:{title:'A'},createdAt:1},{operationId:'b',deleted:false,value:{title:'B'},createdAt:2}]};s.records[`${book.id}/book/default`]=record;queueValue(s,record,{title:'A'},true);const operation=prepareBatch(s).operations[0];expect(operation.baseRevision).toBe(2);expect(Object.keys(operation).sort()).toEqual(['baseRevision','bookId','deleted','id','kind','recordId','value']);});
