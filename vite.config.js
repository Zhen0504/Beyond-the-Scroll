import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 设为相对路径，便于部署到 GitHub Pages 等子路径
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { rolldownOptions: { input: { main: 'index.html', paperPuppet: 'paper-puppet.html' } } },
  server: { port: 5173, open: true },
});
