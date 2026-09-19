import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Keep PDF fonts and character maps local in both hosted and native builds.
export function pdfAssets(): Plugin {
  const assets = ['cmaps', 'standard_fonts', 'wasm', 'iccs'].flatMap(
    (directory) =>
      readdirSync(resolve('node_modules/pdfjs-dist', directory)).map(
        (name) => ({
          name: `assets/pdfjs/${directory}/${name}`,
          path: resolve('node_modules/pdfjs-dist', directory, name),
        }),
      ),
  );
  return {
    name: 'quire-pdf-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.find(
          (item) => '/' + item.name === request.url?.split('?')[0],
        );
        if (!asset) return next();
        response.setHeader(
          'Content-Type',
          asset.name.endsWith('.js')
            ? 'text/javascript'
            : 'application/octet-stream',
        );
        response.end(readFileSync(asset.path));
      });
    },
    generateBundle() {
      for (const asset of assets)
        this.emitFile({
          type: 'asset',
          fileName: asset.name,
          source: readFileSync(asset.path),
        });
    },
  };
}
