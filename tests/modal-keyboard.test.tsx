import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {Modal} from '../src/components/Modal';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('shrinks the dialog scroll area instead of recentering the header above its original position',async()=>{
 const previous=Object.getOwnPropertyDescriptor(window,'visualViewport');
 const showModal=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal');
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 const viewport=Object.assign(new EventTarget(),{offsetTop:0,offsetLeft:0,width:390,height:844});
 Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<Modal title="Settings" onClose={()=>{}}><input aria-label="Account"/></Modal>));
  const dialog=host.querySelector('dialog')!;
  vi.spyOn(dialog,'getBoundingClientRect').mockReturnValue({height:680} as DOMRect);
  await act(async()=>viewport.dispatchEvent(new Event('resize')));
  const originalTop=dialog.style.top;
  await act(async()=>{host.querySelector('input')!.focus();viewport.height=410;viewport.width=375;viewport.dispatchEvent(new Event('resize'));});
  expect(dialog.style.top).toBe(originalTop);expect(dialog.style.maxHeight).toBe('316px');
  await act(async()=>{viewport.offsetTop=74;viewport.dispatchEvent(new Event('scroll'));});
  expect(dialog.style.top).toBe('156px');
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();if(showModal)Object.defineProperty(HTMLDialogElement.prototype,'showModal',showModal);else Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');if(previous)Object.defineProperty(window,'visualViewport',previous);else Reflect.deleteProperty(window,'visualViewport');}
});
