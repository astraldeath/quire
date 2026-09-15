import 'fake-indexeddb/auto';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {it,vi,expect} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
it('benchmarks repeated metadata reads with downloaded EPUBs',async()=>{
 const s=await import('../src/storage');s.useBrowserAccount('perf-fixture');
 for(let i=0;i<8;i++)await s.putBook({id:String(i),title:'Book',author:'',series:'',volume:null,cover:'',addedAt:1,local:true},new Uint8Array(4*1024*1024));
 const start=performance.now();for(let i=0;i<20;i++)expect((await s.listBooks()).length).toBe(8);writeFileSync(tmpdir()+'/quire-storage-benchmark.json',JSON.stringify({milliseconds:performance.now()-start}));
});
