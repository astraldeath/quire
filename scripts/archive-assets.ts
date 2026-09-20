import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Reviewed against libarchive.js 2.0.2. Keep listing flat (no untrusted object
// keys), reject unsafe allocations in the worker, and release native archive
// handles after each scan/extraction. Re-review these hooks on dependency updates.
export function archiveWorker(source: string) {
  if (
    createHash('sha256').update(source).digest('hex') !==
    '552fd4c4e96e677b8d1ee28b96eec3f7761f19ae9069b6df40c1848b3b632493'
  )
    throw new Error('libarchive.js changed: review the comic decoder guards.');
  return source
    .replace(
      'open(e,r){F.open(e).then((()=>r()))}',
      'async open(e){await F.open(e)}',
    )
    .replace(
      '*entries(e=!1,r=null){let t;for(',
      '*entries(e=!1,r=null){let t,count=0;try{for(',
    )
    .replace(
      'if("FILE"===n.type){let e=n.path.split("/");',
      'if(++count>50000)throw new Error("Comic has too many archive entries.");if(!Number.isSafeInteger(n.size)||n.size<0||n.size>134217728)throw new Error("Comic entry exceeds decompression limits.");if(this._runCode.entryIsEncrypted(t))throw new Error("Password-protected comics are unsupported.");if("FILE"===n.type){let e=n.path.split("/");',
    )
    .replace(
      'yield n}}async _loadFile',
      'yield n}}finally{if(this._archive){this._runCode.closeArchive(this._archive);this._archive=null}}}async _loadFile',
    );
}

export function archiveAssets(): Plugin {
  const root = resolve('node_modules/libarchive.js/dist');
  const assets = [
    {
      name: 'worker-bundle.js',
      data: archiveWorker(
        readFileSync(resolve(root, 'worker-bundle.js'), 'utf8'),
      ),
      type: 'text/javascript',
    },
    {
      name: 'libarchive.wasm',
      data: readFileSync(resolve(root, 'libarchive.wasm')),
      type: 'application/wasm',
    },
  ];
  return {
    name: 'quire-archive-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const asset = assets.find(
          (a) => req.url?.split('?')[0] === `/assets/archive/${a.name}`,
        );
        if (!asset) return next();
        res.setHeader('Content-Type', asset.type);
        res.end(asset.data);
      });
    },
    generateBundle() {
      for (const asset of assets)
        this.emitFile({
          type: 'asset',
          fileName: `assets/archive/${asset.name}`,
          source: asset.data,
        });
    },
  };
}
