import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4570,
    strictPort: true,
    // Прокси вместо CORS: фронт и API живут на одном origin, поэтому
    // никакой настройки заголовков на сервере не нужно вообще.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4571',
        changeOrigin: true,
      },
      '/photos': {
        target: 'http://127.0.0.1:4571',
        changeOrigin: true,
      },
    },
  },
});
