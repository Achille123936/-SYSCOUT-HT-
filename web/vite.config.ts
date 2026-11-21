import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE : sous-chemin de publication (GitHub Pages : /nom-du-depot/)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
});
