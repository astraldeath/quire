import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
beforeEach(()=>{vi.resetModules();sessionStorage.clear();vi.stubEnv('VITE_HOSTED','true');});
it('restores the token after a module reload and removes it on sign out',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({token:'secret',session:{id:'session'}}))));
 const first=await import('../src/features/sync/transport');
 await first.login(location.origin,'alice','password');
 vi.resetModules();
 const restored=await import('../src/features/sync/transport');
 expect(restored.restoreBrowserAccount()).toEqual({origin:location.origin,username:'alice',sessionId:'session'});
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({id:'alice-id'})));
 await restored.accountRequest(restored.restoreBrowserAccount()!,'/v1/me');
 expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).toMatchObject({Authorization:'Bearer secret'});
 vi.mocked(fetch).mockResolvedValue(new Response(null,{status:204}));
 await restored.logout(restored.restoreBrowserAccount()!);
 expect(restored.restoreBrowserAccount()).toBeUndefined();
});
it('does not restore malformed or foreign-origin sessions',async()=>{
 sessionStorage.setItem('quire-hosted-session',JSON.stringify({origin:'https://other.example',username:'alice',sessionId:'s',token:'t'}));
 const transport=await import('../src/features/sync/transport');
 expect(transport.restoreBrowserAccount()).toBeUndefined();
});

it('downloads server backups with authentication and refuses oversized browser downloads',async()=>{
 const transport=await import('../src/features/sync/transport');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({token:'secret',session:{id:'session'}}))));
 await transport.login(location.origin,'alice','password');const account=transport.restoreBrowserAccount()!;
 vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Length':'3'}}));
 const progress=vi.fn();const blob=await transport.downloadServerBackup(account,progress);
 expect(blob.size).toBe(3);expect(progress).toHaveBeenLastCalledWith(3,3);
 expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({method:'POST',headers:{Authorization:'Bearer secret'}});
 vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1]),{headers:{'Content-Length':String(513*1024*1024)}}));
 await expect(transport.downloadServerBackup(account,progress)).rejects.toThrow('512 MB');
});
