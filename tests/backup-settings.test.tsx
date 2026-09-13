import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {BackupSettings} from '../src/features/backup/BackupSettings';
import {createBackup} from '../src/features/backup/archive';
import {defaults,type Book} from '../src/domain/models';
vi.mock('../src/features/backup/export',()=>({exportBackup:vi.fn().mockResolvedValue(false)}));
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{document.body.replaceChildren();vi.clearAllMocks();});
const book:Book={id:'a'.repeat(64),title:'A book',author:'',series:'',volume:null,cover:'',addedAt:1,local:false};
it('requires preview confirmation and leaves settings opt-in',async()=>{
 const bytes=await createBackup([{book}],defaults,'data');const actions={prepare:vi.fn(),restore:vi.fn().mockResolvedValue(undefined),exported:vi.fn()};const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<BackupSettings books={[book]} preferences={defaults} actions={actions} onBusy={()=>{}}/>));
 const input=document.querySelector('input[type=file]')!;Object.defineProperty(input,'files',{value:[{size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 expect(document.body.textContent).toContain('0 new books; 1 matching books');expect(actions.restore).not.toHaveBeenCalled();
 const restore=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Restore backup')!;await act(async()=>restore.click());expect(actions.restore).toHaveBeenCalledWith(expect.objectContaining({kind:'data'}),false);expect(document.body.textContent).toContain('Backup restored.');await act(async()=>root.unmount());
});
it('does not record a cancelled export as a completed backup',async()=>{
 const actions={prepare:vi.fn().mockResolvedValue(new Uint8Array([1])),restore:vi.fn(),exported:vi.fn()};const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<BackupSettings books={[]} preferences={defaults} actions={actions} onBusy={()=>{}}/>));
 await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Create backup')!.click());
 expect(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Create backup')).toBe(false);
 await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.startsWith('Save backup'))!.click());
 expect(actions.exported).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('Backup exported.');await act(async()=>root.unmount());
});
