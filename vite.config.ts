import react from '@vitejs/plugin-react';
import {readFileSync} from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'url';

// Dynamic import to avoid rolldown trying to bundle @tailwindcss/oxide during config loading
const tailwindcss = await import('@tailwindcss/vite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// package.json is the single source of the app version (see src/version.ts).
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8')) as {version: string};

// Build stamp for the About screen: the short commit and the build date (UTC). Falls back to "unknown" outside a git checkout.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
  } catch {
    return 'unknown';
  }
})();
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss.default()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD__: JSON.stringify(`${commit} · ${buildDate}`),
    },
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
