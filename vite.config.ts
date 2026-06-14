// NOTE: Vite resolves vite.config.js before vite.config.ts.
// The active config is vite.config.js — keep both in sync.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
