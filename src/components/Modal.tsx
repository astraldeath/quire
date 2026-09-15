import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {dialogPosition,safeInsets,visualBox} from './dialogPosition';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    ref.current?.showModal();
    let resting=visualBox();let anchor:number|undefined;
    const update = () => {
      const panel=ref.current;if(!panel)return;
      const box=visualBox(),safe=safeInsets();
      const editing=!!panel.querySelector('input:focus,textarea:focus,[contenteditable=true]:focus');
      const keyboard=Math.abs(box.width-resting.width)<=24&&(box.height<resting.height-80||(editing&&box.height<resting.height));
      if(!keyboard){resting=box;panel.style.maxHeight=`${Math.max(0,box.height-safe.top-safe.bottom-24)}px`;}
      const position=dialogPosition(box,panel.getBoundingClientRect().height,safe,keyboard?anchor:undefined);
      if(!keyboard)anchor=position.anchor;
      Object.assign(panel.style,{position:'fixed',margin:'0',left:`${position.left}px`,top:`${position.top}px`,transform:'translateX(-50%)',maxWidth:`${Math.max(0,box.width-32)}px`,maxHeight:`${position.maxHeight}px`});
    };
    const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);
    if(ref.current)resize?.observe(ref.current);
    update();const vv=window.visualViewport;vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{resize?.disconnect();vv?.removeEventListener('resize',update);vv?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  }, []);
  return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose();}} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}>
    <div className="modal-inner"><header className="modal-header"><h2>{title}</h2><button className="icon" aria-label="Close dialog" onClick={onClose}><X /></button></header>{children}</div>
  </dialog>;
}
