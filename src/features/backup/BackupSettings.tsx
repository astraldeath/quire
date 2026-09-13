import {useRef,useState} from 'react';
import {Download,Upload,Archive,LoaderCircle} from 'lucide-react';
import type {Book,Preferences} from '../../domain/models';
import {Segments,Switch} from '../../components/Controls';
import {readBackup,MAX_BACKUP_BYTES,type Backup} from './archive';
import {exportBackup} from './export';
export interface BackupActions {
 prepare(kind:Backup['kind']):Promise<Uint8Array>;
 restore(backup:Backup,settings:boolean):Promise<void>;
 exported():Promise<void>;
}
export function BackupSettings({books,preferences,actions,onBusy}:{books:Book[];preferences:Preferences;actions:BackupActions;onBusy(value:boolean):void}){
 const [kind,setKind]=useState<Backup['kind']>('full');const [prepared,setPrepared]=useState<Uint8Array|null>(null);
 const [preview,setPreview]=useState<Backup|null>(null);const [settings,setSettings]=useState(false);
 const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const input=useRef<HTMLInputElement>(null);
 const run=async(label:string,work:()=>Promise<void>)=>{setBusy(label);onBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'The backup operation failed. Please try again.');}finally{setBusy('');onBusy(false);}};
 const matched=preview?.records.filter(r=>books.some(b=>b.id===r.book.id)).length??0;
 return <section className="backup-settings" aria-label="Backup and restore"><h3>Backup & restore</h3>
 <p className="muted">Save your library to a file. Restore it here or on another device.</p>
 <p className="muted">Last backup: {preferences.lastBackupAt?new Date(preferences.lastBackupAt).toLocaleString():'Not yet exported'}</p>
 <fieldset disabled={!!busy} className="backup-controls">
 <Segments label="Include in backup" value={kind} options={[{value:'full',label:'Full library'},{value:'data',label:'Data only'}]} onChange={v=>{setKind(v);setPrepared(null);}}/>
 <p className="muted">{kind==='full'?'Books available on this device, covers, progress, notes, highlights, and settings.':'Covers, progress, notes, highlights, and settings. Import the matching EPUB files to read on another device.'}</p>
 {books.some(b=>!b.local)&&kind==='full'&&<p className="muted">Removed book files cannot be included; their saved data is included.</p>}
 <div className="backup-actions"><button onClick={()=>void run('Preparing backup',async()=>{setPrepared(null);setPreview(null);setPrepared(await actions.prepare(kind));})}><Archive/>Create backup</button>
 {prepared&&<button className="primary" onClick={()=>void run('Saving backup',async()=>{if(await exportBackup(prepared)){await actions.exported();setMessage('Backup exported.');setPrepared(null);}})}><Download/>Save backup ({(prepared.length/1024/1024).toFixed(1)} MB)</button>}</div>
 <input className="file-input" ref={input} type="file" accept=".quire-backup,.zip,application/zip,application/octet-stream" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run('Checking backup',async()=>{setPreview(null);setPrepared(null);setSettings(false);if(file.size>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 512 MB limit.');setPreview(await readBackup(new Uint8Array(await file.arrayBuffer())));});}}/>
 <button className="text-action" onClick={()=>input.current?.click()}><Upload/>Choose backup to restore</button>
 {preview&&<div className="backup-preview"><h4>Restore preview</h4><p>{new Date(preview.createdAt).toLocaleString()}</p>
 <ul><li>{preview.records.length-matched} new books; {matched} matching books</li><li>{preview.records.filter(r=>r.file).length} book files included</li><li>{preview.records.reduce((n,r)=>n+(r.book.annotations?.length??0),0)} saved bookmarks, highlights, and notes</li></ul>
 <p>Existing books stay in your library. Newer progress is kept, and conflicting notes are preserved as separate entries.</p>
 <Switch label="Restore settings too" checked={settings} onChange={setSettings}/>
 <div className="backup-actions"><button className="primary" onClick={()=>void run('Restoring library',async()=>{await actions.restore(preview,settings);setPreview(null);setMessage('Backup restored.');})}>Restore backup</button><button onClick={()=>setPreview(null)}>Cancel</button></div></div>}
 </fieldset>
 {busy&&<p role="status"><LoaderCircle className="spin"/> {busy}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
