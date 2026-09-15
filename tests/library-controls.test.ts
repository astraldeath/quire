import {describe,expect,it} from 'vitest';
import {continueBook,entriesFor,readingStatus} from '../src/domain/library';
import {defaults,type Book} from '../src/domain/models';
const book=(id:string,props:Partial<Book>={}):Book=>({id,title:id,author:'Author',series:'',volume:null,cover:'',addedAt:1,local:false,...props});
const position=(fraction:number,updatedAt=1)=>({fraction,updatedAt,cfi:'',section:''});
describe('library controls',()=>{
 it('distinguishes unread, active, and finished using the completion threshold',()=>{
  expect(readingStatus(book('a'))).toBe('unread');
  expect(readingStatus(book('a',{position:position(0)}))).toBe('unread');
  expect(readingStatus(book('a',{position:position(.998)}))).toBe('reading');
  expect(readingStatus(book('a',{position:position(.999)}))).toBe('finished');
 });
 it('filters reading by unfinished progress, with explicit status and availability overrides',()=>{
  const books=[book('unread'),book('active',{local:true,position:position(.5)}),book('done',{position:position(1)})];
  expect(entriesFor(books,defaults,'',true,null).map(e=>e.key)).toEqual(['book:active']);
  expect(entriesFor(books,defaults,'',true,null,{status:'finished',availability:'cloud'}).map(e=>e.key)).toEqual(['book:done']);
  expect(entriesFor(books,defaults,'',true,null,{status:'all',availability:'downloaded'}).map(e=>e.key)).toEqual(['book:active']);
 });
 it('continues newest unfinished book and advances a recently finished series to its next unread volume',()=>{
  const older=book('older',{position:position(.4,10)});
  const done=book('done',{series:'S',volume:2,position:position(1,20)});
  const previous=book('previous',{series:'S',volume:1});
  const next=book('next',{series:'S',volume:3});
  expect(continueBook([older,done,previous,next])?.id).toBe('next');
  expect(continueBook([older,done,previous])?.id).toBe('older');
  expect(continueBook([done,previous])).toBeUndefined();
  expect(continueBook([next])).toBeUndefined();
 });
 it('sorts last read separately from newly added books',()=>{
  const books=[book('new',{addedAt:100}),book('read',{position:position(.2,10)}),book('old',{addedAt:2})];
  expect(entriesFor(books,{...defaults,sort:'last-read'},'',false,null).map(e=>e.title)).toEqual(['read','new','old']);
  expect(entriesFor(books,{...defaults,sort:'added'},'',false,null).map(e=>e.title)).toEqual(['new','old','read']);
 });
 it('allows explicit sorting inside series, retaining default volume order',()=>{
  const books=[book('Z',{series:'S',volume:1}),book('A',{series:'S',volume:2})];
  expect(entriesFor(books,defaults,'',false,'S').map(e=>e.title)).toEqual(['Z','A']);
  expect(entriesFor(books,{...defaults,sort:'title'},'',false,'S').map(e=>e.title)).toEqual(['A','Z']);
  expect(entriesFor(books,{...defaults,sort:'volume'},'',false,'S').map(e=>e.title)).toEqual(['Z','A']);
 });
});
