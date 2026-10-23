import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
export default defineConfig(({ mode }) => ({
  base: './',
  server: mode === 'https' ? { https: {
    key: readFileSync(new URL('./.cert/dev-key.pem', import.meta.url)),
    cert: readFileSync(new URL('./.cert/dev.pem', import.meta.url)),
  } } : {},
}));
