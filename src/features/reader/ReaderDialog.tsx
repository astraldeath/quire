import {dialogPosition,safeInsets,visualBox} from '../../components/dialogPosition';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
export function ReaderDialog({label,onClose,children}:{label:string;onClose():void;children:ReactNode}) {
  const element=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState(()=>({top:window.visualViewport?.offsetTop??0,left:window.visualViewport?.offsetLeft??0,width:window.visualViewport?.width??window.innerWidth,height:window.visualViewport?.height??window.innerHeight,paddingTop:undefined as number|undefined,paddingBottom:undefined as number|undefined,alignItems:undefined as 'flex-start'|undefined}));
  useLayoutEffect(()=>{
    let resting=visualBox();let anchor:number|undefined;
    const update=()=>{
      const box=visualBox(),safe=safeInsets();
      const editing=!!element.current?.querySelector('input:focus,textarea:focus,[contenteditable=true]:focus');
      const keyboard=Math.abs(box.width-resting.width)<=24&&(box.height<resting.height-80||(editing&&box.height<resting.height));
      if(!keyboard)resting=box;
      const position=dialogPosition(box,element.current?.getBoundingClientRect().height??680,safe,keyboard?anchor:undefined);
      if(!keyboard)anchor=position.anchor;
      setViewport({...box,paddingTop:keyboard?position.anchor:undefined,paddingBottom:keyboard?safe.bottom+12:undefined,alignItems:keyboard?'flex-start':undefined});
    };
    update();
    const vv=window.visualViewport;vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);
    const previous=document.activeElement as HTMLElement|null;
    if(!element.current?.contains(document.activeElement))element.current?.focus();
    return()=>{vv?.removeEventListener('resize',update);vv?.removeEventListener('scroll',update);window.removeEventListener('resize',update);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div className="reader-dialog-layer" style={viewport} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose();}} onKeyDown={e=>{
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();onClose();}
    if(e.key==='Tab'){
      const nodes=Array.from(element.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,iframe,[tabindex="0"]')??[]).filter(node=>!node.closest('[hidden]'));
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first){e.preventDefault();return;}
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===element.current)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===element.current)){e.preventDefault();first.focus();}
    }
  }}><div ref={element} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="annotation-panel reader-dialog">{children}</div></div>;
}
