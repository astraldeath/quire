import {fetchCovers} from './library';
import {loadSync,syncTransaction} from '../../storage';
import {acceptResponse,applyRecords,emptySync,prepareBatch,queueChanges,queueValue,recordKey,type RemoteRecord,type Candidate} from './model';
import * as transport from './transport';
import {validateResponse} from './validation';
let running:Promise<void>|undefined;
let status={busy:false,message:'Not connected'};
const listeners=new Set<()=>void>();
export const subscribe=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export const snapshot=()=>status;
function report(message:string,busy=false){status={message,busy};listeners.forEach(f=>f());}
export async function connect(origin:string,username:string,password:string){
 if(running)await running;const session=await transport.login(origin,username,password);
 try{await syncTransaction((s,books)=>{if(s.account?.origin!==origin||s.account?.username!==username)Object.assign(s,emptySync());s.account={origin,username,sessionId:session.id};s.enabled=true;for(const book of books)if(!Object.values(s.records).some(r=>r.bookId===book.id)&&!s.pending.some(p=>p.bookId===book.id))queueChanges(s,undefined,book);return {result:undefined};});}
 catch(e){await transport.logout({origin,username,sessionId:session.id}).catch(()=>{});throw e;}
 await syncNow();
}
export async function disconnect(){
 if(running)await running;const account=await syncTransaction(s=>{s.enabled=false;return {result:s.account};});report('Disconnected');if(account)await transport.logout(account);
}
export function syncNow():Promise<void>{
 if(running)return running;
 running=(async()=>{
  const initial=await loadSync();if(!initial.enabled||!initial.account){report('Not connected');return;}
  report('Syncing',true);
  try{
   for(let i=0;i<100;i++){
    const batch=await syncTransaction(s=>({result:{account:s.account,enabled:s.enabled,request:prepareBatch(s)}}));if(!batch.enabled||!batch.account)return;
    const raw=await transport.call(batch.account,batch.request);const response=validateResponse(raw,batch.request.cursor,batch.request.operations.map(o=>o.id));
    const more=await syncTransaction((s,books)=>{if(s.account?.sessionId!==batch.account!.sessionId||!s.enabled)return {result:false};acceptResponse(s,response);return {result:response.hasMore||s.pending.length>0,books:applyRecords(s,books)};});
    if(!more){await fetchCovers(batch.account);const s=await loadSync();const conflicts=Object.values(s.records).filter(r=>r.candidates.length>1).length;report(conflicts?`${conflicts} ${conflicts===1?'conflict needs':'conflicts need'} your choice`:'Up to date');window.dispatchEvent(new Event('quire-synced'));if(import.meta.env.VITE_HOSTED==='true')void transport.accountRequest(batch.account,'/v1/tracking/sync',{},'POST').catch(()=>{});return;}
   }
   report('More changes are queued. Sync will continue shortly.');
  }catch(e){report(e instanceof Error?e.message:String(e));throw e;}
 })().finally(()=>{running=undefined;});return running;
}
export async function resolve(record:RemoteRecord,candidate:Candidate){
 await syncTransaction(s=>{const latest=s.records[recordKey(record)];if(latest?.revision!==record.revision)throw new Error('This conflict changed. Review the latest choices.');if(s.pending.some(p=>recordKey(p)===recordKey(record)))throw new Error('Sync pending edits before resolving this conflict.');queueValue(s,record,candidate.deleted?null:candidate.value,true);return {result:undefined};});await syncNow();
}
export function startSync(){
 let timer:ReturnType<typeof setTimeout>;const run=()=>{void syncNow().catch(()=>{});};const foreground=()=>{if(document.visibilityState==='visible')run();};
 const changed=()=>{if(running)return;clearTimeout(timer);timer=setTimeout(()=>{void loadSync().then(s=>{if(s.pending.length)run();}).catch(()=>{});},1500);};
 window.addEventListener('quire-storage',changed);window.addEventListener('online',run);document.addEventListener('visibilitychange',foreground);const interval=setInterval(foreground,import.meta.env.VITE_HOSTED==='true'?10000:60000);run();
 return()=>{clearTimeout(timer);clearInterval(interval);window.removeEventListener('quire-storage',changed);window.removeEventListener('online',run);document.removeEventListener('visibilitychange',foreground);};
}
