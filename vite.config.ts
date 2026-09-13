import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { hardenFoliate } from './scripts/foliate-transform.ts';
export default defineConfig({
  plugins: [{
    name: 'quire-book-sandbox', enforce: 'pre',
    transform: hardenFoliate,
  }, react()],
  optimizeDeps: { exclude: ['foliate-js'] }, clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
