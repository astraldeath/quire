import {useEffect,useRef,type ReactNode} from 'react';
export function BookOpenButton({label,onOpen,onActions,children}:{label:string;onOpen():void;onActions():void;children:ReactNode}){
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const start=useRef<{x:number;y:number}|null>(null);const held=useRef(false);
 const cancel=()=>{clearTimeout(timer.current);start.current=null;};
 useEffect(()=>cancel,[]);
 return <button className="book-open" aria-label={label} aria-haspopup="dialog"
 onPointerDown={e=>{cancel();held.current=false;if(e.pointerType==='mouse'||!e.isPrimary)return;start.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(()=>{held.current=true;start.current=null;onActions();},500);}}
 onPointerMove={e=>{if(start.current&&Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>10)cancel();}}
 onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
 onContextMenu={e=>{e.preventDefault();cancel();if(!held.current){held.current=true;onActions();}}}
 onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')held.current=false;if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();cancel();held.current=true;onActions();}}}
 onClick={e=>{if(held.current){e.preventDefault();held.current=false;return;}onOpen();}}
 >{children}</button>;
}
