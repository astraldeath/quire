import {useState} from 'react';
import {Archive,Library,Palette} from 'lucide-react';
import {BackupSettings,type BackupActions} from '../backup/BackupSettings';
import {defaults,type Book,type Preferences} from '../../domain/models';
import {Modal} from '../../components/Modal';
import {SettingsTabs} from '../../components/SettingsTabs';
import {ThemePicker,StepperControl,Switch,ColorControl} from '../../components/Controls';
export function Settings({preferences:p,books,backupActions,onChange,onClose}:{books:Book[];backupActions:BackupActions;preferences:Preferences;onChange(p:Preferences):void;onClose():void}){
 const [working,setWorking]=useState(false);
 return <Modal title="Settings" onClose={()=>{if(!working)onClose();}}><SettingsTabs label="Settings sections" disabled={working} tabs={[
 {id:'appearance',label:'Appearance',icon:Palette,content:<div className="settings-body">
 <ThemePicker label="App theme" value={p.theme} options={['system','light','dark','onyx','contrast','custom']} onChange={theme=>onChange({...p,theme})}/>
 {p.theme==='custom'&&<><ColorControl label="Background color" value={p.background} onChange={background=>onChange({...p,background})}/><ColorControl label="Text color" value={p.foreground} onChange={foreground=>onChange({...p,foreground})}/></>}
 {p.theme==='contrast'?<p className="settings-note">Your accent color is restored when you switch themes.</p>:<ColorControl label="Accent color" value={p.accent} onChange={accent=>onChange({...p,accent})}/>}
 <button className="text-action" onClick={()=>onChange({...p,theme:defaults.theme,accent:defaults.accent,background:defaults.background,foreground:defaults.foreground})}>Reset appearance</button></div>},
 {id:'library',label:'Library',icon:Library,content:<div className="settings-body"><StepperControl label="Cover size" min={110} max={210} step={10} value={p.coverSize} unit=" px" onChange={coverSize=>onChange({...p,coverSize})}/><Switch label="Group books into series" checked={p.groupSeries} onChange={groupSeries=>onChange({...p,groupSeries})}/><p className="muted">Reading themes and typography are available inside each book. Preferences are saved on this device.</p><button className="text-action" onClick={()=>onChange({...p,coverSize:defaults.coverSize,groupSeries:defaults.groupSeries})}>Reset library settings</button></div>},
 {id:'backups',label:'Backups',icon:Archive,content:<BackupSettings books={books} preferences={p} actions={backupActions} onBusy={setWorking}/>}
 ]}/></Modal>;
}
