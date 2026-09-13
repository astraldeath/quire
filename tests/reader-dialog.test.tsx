import {act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it}from'vitest';import {ReaderDialog}from'../src/features/reader/ReaderDialog';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('tracks the visual viewport when the software keyboard shrinks and pans it',async()=>{
 const previous=Object.getOwnPropertyDescriptor(window,'visualViewport');const viewport=Object.assign(new EventTarget(),{offsetTop:0,offsetLeft:0,width:390,height:844});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<ReaderDialog label="Note" onClose={()=>{}}><textarea defaultValue="Draft"/></ReaderDialog>));const layer=host.querySelector<HTMLElement>('.reader-dialog-layer')!;expect(layer.style.height).toBe('844px');
 await act(async()=>{viewport.height=410;viewport.offsetTop=74;viewport.dispatchEvent(new Event('resize'));});expect(layer.style.height).toBe('410px');expect(layer.style.top).toBe('74px');expect(host.querySelector('textarea')!.value).toBe('Draft');}
 finally{await act(async()=>root.unmount());host.remove();if(previous)Object.defineProperty(window,'visualViewport',previous);else Reflect.deleteProperty(window,'visualViewport');}
});
