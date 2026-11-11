import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  envDir: root,
  server: { strictPort: true, fs: { allow: [root] } },
});
