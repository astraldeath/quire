import {useEffect,useState,useSyncExternalStore} from 'react';
import {Cloud,RefreshCw,LogOut,Check,ChevronDown,ArrowRight,Search,LoaderCircle} from 'lucide-react';
import {loadSync} from '../../storage';
import {emptySync,recordKey,type SyncState} from './model';
import {connect,disconnect,resolve,snapshot,subscribe,syncNow} from './engine';
import {discover,serverOrigin} from './transport';
import {isTauri} from '@tauri-apps/api/core';
export function ServerSettings(){
 const [state,setState]=useState<SyncState>(emptySync);const status=useSyncExternalStore(subscribe,snapshot);
 const [account,setAccount]=useState('');const [url,setURL]=useState('');const [password,setPassword]=useState('');const [server,setServer]=useState<{name:string;origin:string;username:string}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{const refresh=()=>{void loadSync().then(setState).catch(e=>setError(String(e)));};refresh();window.addEventListener('quire-storage',refresh);return()=>window.removeEventListener('quire-storage',refresh);},[]);
 const perform=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const check=()=>perform(async()=>{const split=account.lastIndexOf('@');const username=split>0?account.slice(0,split):account;const host=split>0?account.slice(split+1):'';if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(username))throw new Error('Enter your account name, such as alice@books.example.com.');const origin=serverOrigin(url||`https://${host}`);setServer({...await discover(origin),username});});
 const conflicts=Object.values(state.records).filter(r=>r.candidates.length>1);
 return <div className="settings-body server-settings">
 <div><h3><Cloud aria-hidden="true"/> Your server</h3><p className="muted">Sync your library, reading progress, and saved passages across devices. Books stay on this device until you choose to upload them.</p></div>
 {state.enabled&&state.account?<>
 <div className="server-summary"><strong>{state.account.username}</strong><span className="muted">{state.account.origin}</span><span role="status">{status.message}</span>{state.lastSync&&<small className="muted">Last synced {new Date(state.lastSync).toLocaleString()}</small>}<span className="muted">{state.pending.length} pending changes</span></div>
 <div className="server-actions"><button className="text-action" disabled={busy||status.busy} onClick={()=>void perform(syncNow)}><RefreshCw/> Sync now</button><button className="text-action" disabled={busy||status.busy} onClick={()=>void perform(disconnect)}><LogOut/> Sign out</button></div>
 <p className="settings-note">Signing out keeps your local books and unsynced edits. Sign back into the same account to continue.</p>
 {status.message.startsWith('Sign in')&&<button disabled={busy} onClick={()=>void perform(disconnect)}>Reconnect this device</button>}
 </>:<form onSubmit={e=>{e.preventDefault();void (server?perform(async()=>{const secret=password;setPassword('');await connect(server.origin,server.username,secret);}):check());}}>
 <label>Account<input autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="alice@books.example.com" value={account} disabled={busy} onChange={e=>{setAccount(e.target.value);setServer(null);}}/></label>
 <details className="server-advanced"><summary><span>Advanced server address</span><ChevronDown aria-hidden="true"/></summary><div className="server-advanced-content"><p className="settings-note">Use a custom address or port for your server.</p><label>Server URL<input type="url" placeholder="https://books.example.com:8443" value={url} disabled={busy} onChange={e=>{setURL(e.target.value);setServer(null);}}/></label></div></details>
 {server&&<><p><Check aria-hidden="true"/> {server.name}<br/><span className="muted">{server.origin}</span></p><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label><p className="settings-note">Signing in syncs this device’s library and reading data with this account. EPUB files and appearance settings are not uploaded automatically.</p></>}
 <button type="submit" className="primary server-connect" disabled={busy}>{busy?<LoaderCircle className="server-spinner" aria-hidden="true"/>:server?<ArrowRight aria-hidden="true"/>:<Search aria-hidden="true"/>}{busy?'Connecting…':server?'Sign in and sync':'Find server'}</button>
 {!isTauri()&&<p className="settings-note server-session-note">You’ll stay signed in until this browser tab closes.</p>}
 </form>}
 {error&&<p role="alert">{error}</p>}
 {state.enabled&&conflicts.length>0&&<section><h3>Choose which version to keep</h3><p className="muted">These changes were made on different devices. All versions are saved until you choose.</p>{conflicts.map(r=><div className="sync-conflict" key={recordKey(r)}><strong>{r.kind==='position'?'Reading position':r.kind==='book'?'Book information':'Saved passage'}</strong>{r.candidates.map(c=><button key={c.operationId} disabled={busy||status.busy} onClick={()=>void perform(()=>resolve(r,c))}><span>{c.deleted?'Keep deletion':r.kind==='position'?`${c.value?.section||'Reading position'} · ${Math.round(Number(c.value?.fraction)*100)}%`:String(c.value?.note||c.value?.text||c.value?.title||'Saved passage')}</span><small>Use this version</small></button>)}</div>)}</section>}
 </div>;
}
