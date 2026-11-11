import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

function externalMediaBuild() {
  return {
    name: 'external-media-build',
    closeBundle() {
      if (!process.env.VITE_MEDIA_BASE_URL) return;
      const walk = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (extname(entry.name).toLowerCase() === '.mp4') rmSync(path);
        }
      };
      walk(resolve('dist/assets'));
    },
  };
}

export default defineConfig({ plugins: [react(), externalMediaBuild()] });
