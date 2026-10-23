import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'notifications-sw.js'],
        workbox: { importScripts: ['/notifications-sw.js'] },
        manifest: {
          name: 'HaHu Cards',
          short_name: 'HaHu Cards',
          description: 'A powerful flashcard and exam study application',
          theme_color: '#171717',
          background_color: '#0a0a0a',
          display: 'standalone',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'ui-vendor': ['lucide-react', 'motion', 'react-image-crop'],
            'data': ['./src/sampleCardsData.ts']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: ['.e2b.app'],
      headers: {
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
