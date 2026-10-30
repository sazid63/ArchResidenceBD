import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'url';

// Dynamic import to avoid rolldown trying to bundle @tailwindcss/oxide during config loading
const tailwindcss = await import('@tailwindcss/vite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss.default()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['@tailwindcss/oxide'],
    },
    build: {
      // Exclude Node.js builtins from browser bundle
      rollupOptions: {
        external: ['fs', 'path', 'url', 'child_process'],
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
