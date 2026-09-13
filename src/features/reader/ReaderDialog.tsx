import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
export function ReaderDialog({label,onClose,children}:{label:string;onClose():void;children:ReactNode}) {
  const element=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState(()=>({top:window.visualViewport?.offsetTop??0,left:window.visualViewport?.offsetLeft??0,width:window.visualViewport?.width??window.innerWidth,height:window.visualViewport?.height??window.innerHeight}));
  useLayoutEffect(()=>{
    const update=()=>setViewport({top:window.visualViewport?.offsetTop??0,left:window.visualViewport?.offsetLeft??0,width:window.visualViewport?.width??window.innerWidth,height:window.visualViewport?.height??window.innerHeight});
    const vv=window.visualViewport;vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);
    const previous=document.activeElement as HTMLElement|null;
    if(!element.current?.contains(document.activeElement))element.current?.focus();
    return()=>{vv?.removeEventListener('resize',update);vv?.removeEventListener('scroll',update);window.removeEventListener('resize',update);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div className="reader-dialog-layer" style={viewport} onKeyDown={e=>{
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();onClose();}
    if(e.key==='Tab'){
      const nodes=Array.from(element.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,iframe,[tabindex="0"]')??[]);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first){e.preventDefault();return;}
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===element.current)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===element.current)){e.preventDefault();first.focus();}
    }
  }}><div ref={element} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="annotation-panel reader-dialog">{children}</div></div>;
}
