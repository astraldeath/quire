import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReaderTools } from '../src/features/reader/ReaderTools';
import type { View } from 'foliate-js/view.js';
import type { Book } from '../src/domain/models';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});
async function setup(annotations: Book["annotations"]=[]){
 const toolbar=document.createElement('header'),host=document.createElement('div'),text=document.createElement('p');text.textContent='A passage worth remembering';document.body.append(toolbar,host,text);
 const view=Object.assign(document.createElement('div'),{renderer:{getContents:()=>[{doc:document,index:0}]},getCFI:()=> 'epubcfi(/6/2!/4/2:0)',addAnnotation:vi.fn().mockResolvedValue({}),deleteAnnotation:vi.fn().mockResolvedValue({}),clearSearch:vi.fn()}) as unknown as View;
 const book:Book={annotations,id:'test',title:'Test',author:'',series:'',volume:null,cover:'',addedAt:0,local:true,position:{cfi:'epubcfi(/6/2)',fraction:0,section:'Chapter one',updatedAt:0}};
 const onSave=vi.fn().mockResolvedValue(undefined);const root=createRoot(host);
 await act(async()=>root.render(<ReaderTools otherPanelOpen={false} onOpen={()=>{}} toolbar={toolbar} view={view} book={book} visible onSave={onSave} navigate={vi.fn()} />));
 return {toolbar,host,text,view,book,onSave,root};
}
async function click(label:string){const button=document.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;expect(button).not.toBeNull();await act(async()=>button.click());}
it('bookmarks the current persisted reading location',async()=>{const ctx=await setup();await click('Bookmarks and highlights');expect(ctx.onSave).not.toHaveBeenCalled();const add=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Bookmark this page')!;await act(async()=>add.click());expect(ctx.onSave).toHaveBeenCalledWith([expect.objectContaining({kind:'bookmark',cfi:ctx.book.position!.cfi,section:'Chapter one'})]);await act(async()=>ctx.root.unmount());});
it('retains selected passage when selection collapses after opening the note editor',async()=>{
 vi.useFakeTimers();const ctx=await setup();const range=document.createRange();range.selectNodeContents(ctx.text);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);
 await act(async()=>{document.dispatchEvent(new Event('selectionchange'));vi.advanceTimersByTime(200);});
 await click('Add note');
 await act(async()=>{document.getSelection()!.removeAllRanges();document.dispatchEvent(new Event('selectionchange'));vi.advanceTimersByTime(200);});
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(ctx.onSave).toHaveBeenCalledWith([expect.objectContaining({kind:'highlight',text:'A passage worth remembering',cfi:'epubcfi(/6/2!/4/2:0)'})]);
 expect(ctx.view.addAnnotation).toHaveBeenCalledWith({value:'epubcfi(/6/2!/4/2:0)'});await act(async()=>ctx.root.unmount());
});

it('restores saved highlights when opening and when an overlay is recreated',async()=>{
 const ctx=await setup([{id:'saved',kind:'highlight',cfi:'epubcfi(/6/2)',text:'Saved',note:'Note',section:'one',createdAt:0,updatedAt:0}]);
 expect(ctx.view.addAnnotation).toHaveBeenCalledWith({value:'epubcfi(/6/2)'});
 await act(async()=>{ctx.view.dispatchEvent(new CustomEvent('create-overlay',{detail:{index:0}}));});
 expect(ctx.view.addAnnotation).toHaveBeenCalledTimes(2);
 await click('Bookmarks and highlights');expect(document.body.textContent).toContain('Saved');
 await click('Delete saved passage');expect(ctx.onSave).toHaveBeenCalledWith([]);expect(ctx.view.deleteAnnotation).toHaveBeenCalledWith({value:'epubcfi(/6/2)'});
 await act(async()=>ctx.root.unmount());
});

it('keeps the note draft through keyboard reflow and saves its text',async()=>{
 vi.useFakeTimers();const ctx=await setup();const range=document.createRange();range.selectNodeContents(ctx.text);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);
 await act(async()=>{document.dispatchEvent(new Event('selectionchange'));vi.advanceTimersByTime(200);});await click('Add note');
 const textarea=document.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Remember this detail');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{ctx.view.dispatchEvent(new CustomEvent('relocate',{detail:{cfi:'reflowed-location'}}));});
 expect(document.querySelector('textarea')?.value).toBe('Remember this detail');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(ctx.onSave).toHaveBeenCalledWith([expect.objectContaining({note:'Remember this detail',text:'A passage worth remembering'})]);await act(async()=>ctx.root.unmount());
});

it('shows Wiktionary in an isolated frame without a definition API request',async()=>{
 vi.useFakeTimers();const ctx=await setup();ctx.text.textContent='alpha';const range=document.createRange();range.selectNodeContents(ctx.text);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);
 await act(async()=>{document.dispatchEvent(new Event('selectionchange'));vi.advanceTimersByTime(200);});await click('Define selected text');
 const frame=document.querySelector('iframe')!;expect(frame.src).toBe('https://en.wiktionary.org/wiki/alpha?useskin=minerva#English');expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
 await act(async()=>ctx.root.unmount());
});
