import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the LAN so friends can join from their phones
    port: 5173,
  },
  build: { outDir: 'dist', sourcemap: false },
});
