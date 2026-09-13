import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {Palette,Archive} from 'lucide-react';
import {SettingsTabs} from '../src/components/SettingsTabs';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('switches sections with keyboard navigation and preserves inactive content',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<SettingsTabs label="Settings sections" tabs={[{id:'appearance',label:'Appearance',icon:Palette,content:<input defaultValue="draft"/>},{id:'backup',label:'Backups',icon:Archive,content:<p>Backup controls</p>}]}/>));
 const tabs=host.querySelectorAll('button');const input=host.querySelector('input')!;input.value='kept';tabs[0].focus();
 await act(async()=>tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(tabs[1].getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(tabs[1]);expect(input.closest('[role=tabpanel]')?.hasAttribute('hidden')).toBe(true);
 await act(async()=>tabs[0].click());expect(input.value).toBe('kept');await act(async()=>root.unmount());host.remove();
});
