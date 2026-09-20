import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { pdfAssets } from './scripts/pdf-assets.ts';
import { archiveAssets } from './scripts/archive-assets.ts';
import { hardenFoliate } from './scripts/foliate-transform.ts';
export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_HOSTED': JSON.stringify(
      mode === 'hosted' ? 'true' : 'false',
    ),
  },
  plugins: [
    {
      name: 'quire-book-sandbox',
      enforce: 'pre',
      transform: (code, id) => hardenFoliate(code, id, mode === 'hosted'),
    },
    react(),
    pdfAssets(),
    archiveAssets(),
  ],
  optimizeDeps: { exclude: ['foliate-js'] },
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
}));
