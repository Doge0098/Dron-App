/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La app es 100 % estática: todas las APIs (Open-Meteo, RainViewer, NOAA, ENAIRE)
// se consultan desde el navegador. En desarrollo se expone además un proxy hacia
// los servicios de ENAIRE por si su CORS bloquea las peticiones desde localhost.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/enaire-proxy': {
        target: 'https://servais.enaire.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/enaire-proxy/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
