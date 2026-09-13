import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useLayoutEffect(() => {
    const update = () => {
      const vv=window.visualViewport;
      const width=vv?.width??window.innerWidth, height=vv?.height??window.innerHeight;
      if(ref.current)Object.assign(ref.current.style,{position:'fixed',margin:'0',left:`${(vv?.offsetLeft??0)+width/2}px`,top:`${(vv?.offsetTop??0)+height/2}px`,transform:'translate(-50%, -50%)',maxWidth:`${Math.max(0,width-32)}px`,maxHeight:`${Math.max(0,height-32)}px`});
    };
    update();const vv=window.visualViewport;vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{vv?.removeEventListener('resize',update);vv?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  }, []);
  return <dialog ref={ref} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}>
    <div className="modal-inner"><header className="modal-header"><h2>{title}</h2><button className="icon" aria-label="Close dialog" onClick={onClose}><X /></button></header>{children}</div>
  </dialog>;
}
