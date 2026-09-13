import {useRef,useState} from 'react';
import {Download,Upload,LoaderCircle,ArrowLeft} from 'lucide-react';
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
 const [preview,setPreview]=useState<Backup|null>(null);const [fileName,setFileName]=useState('');const [settings,setSettings]=useState(false);
 const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const input=useRef<HTMLInputElement>(null);
 const run=async(label:string,work:()=>Promise<void>)=>{setBusy(label);onBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'The backup operation failed. Please try again.');}finally{setBusy('');onBusy(false);}};
 const matched=preview?.records.filter(r=>books.some(b=>b.id===r.book.id)).length??0;
 return <section className="backup-settings" aria-label="Backup and restore">
 <fieldset disabled={!!busy} className="backup-controls">
 {!preview&&<>
 <div className="backup-export">
 <div className="backup-section-heading"><h3>Export library</h3><p className="muted">{preferences.lastBackupAt?`Last saved ${new Date(preferences.lastBackupAt).toLocaleString()}`:'No backups saved yet'}</p></div>
 <Segments label="Backup contents" value={kind} options={[{value:'full',label:'Full library'},{value:'data',label:'Data only'}]} onChange={v=>{setKind(v);setPrepared(null);setMessage('');}}/>
 <p className="muted">{kind==='full'?'Books, reading progress, notes, highlights, and settings.':'Progress, notes, highlights, covers, and settings. Book files are not included.'}</p>
 {books.some(b=>!b.local)&&kind==='full'&&<p className="backup-hint muted">Only books downloaded to this device are included. Saved reading data is kept for every book.</p>}
 {prepared?<div className="backup-ready"><p>Ready to save <span className="muted">{(prepared.length/1024/1024).toFixed(1)} MB</span></p><button className="primary backup-main-action" onClick={()=>void run('Saving backup',async()=>{if(await exportBackup(prepared)){await actions.exported();setMessage('Backup exported.');setPrepared(null);}})}><Download/>Save backup</button></div>:
 <button className="primary backup-main-action" onClick={()=>void run('Preparing backup',async()=>{setPrepared(await actions.prepare(kind));})}>{busy==='Preparing backup'?<LoaderCircle className="spin"/>:<Download/>}{busy==='Preparing backup'?'Preparing…':'Create backup'}</button>}
 </div>
 <div className="backup-restore"><div className="backup-section-heading"><h3>Restore from a file</h3><p className="muted">Review a backup before adding it to your library.</p></div><button className="backup-secondary" onClick={()=>input.current?.click()}><Upload/>Choose backup file</button></div>
 </>}
 <input className="file-input" ref={input} type="file" accept=".quire-backup,.zip,application/zip,application/octet-stream" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run('Checking backup',async()=>{setPreview(null);setPrepared(null);setSettings(false);if(file.size>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 512 MB limit.');const backup=await readBackup(new Uint8Array(await file.arrayBuffer()));setFileName(file.name);setPreview(backup);});}}/>
 {preview&&<div className="backup-preview"><button className="backup-back" onClick={()=>setPreview(null)}><ArrowLeft/>Back</button><div className="backup-section-heading"><h3>Review backup</h3><p className="backup-filename">{fileName}</p><p className="muted">{new Date(preview.createdAt).toLocaleString()}</p></div>
 <ul><li>{preview.records.length-matched} new books; {matched} matching books</li><li>{preview.records.filter(r=>r.file).length} book files included</li><li>{preview.records.reduce((n,r)=>n+(r.book.annotations?.length??0),0)} saved bookmarks, highlights, and notes</li></ul>
 <p>Existing books stay in your library. Newer progress is kept, and conflicting notes are preserved as separate entries.</p>
 <Switch label="Restore settings too" checked={settings} onChange={setSettings}/>
 <div className="backup-actions"><button className="primary" onClick={()=>void run('Restoring library',async()=>{await actions.restore(preview,settings);setPreview(null);setMessage('Backup restored.');})}>Restore backup</button><button onClick={()=>setPreview(null)}>Cancel</button></div></div>}
 </fieldset>
 {busy&&<p role="status"><LoaderCircle className="spin"/> {busy}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
