import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

/** SSE ??????????????????????????????? */
function sseProxyConfigure(proxy) {
  proxy.on('proxyReq', (proxyReq, req) => {
    if (req.url.includes('/stream') || req.url.includes('/planner/stream')) {
      proxyReq.setHeader('Connection', 'keep-alive')
      proxyReq.setHeader('Cache-Control', 'no-cache')
    }
  })
}

// ?????? API_TARGET ??????????????? 3200?
const API_TARGET = process.env.API_TARGET || 'http://localhost:3200'

export default defineConfig(({ mode }) => ({
  // ?????Nginx ??????????? /ai-travel-h5/ ?? GitHub Pages ??????
  base: '/',
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver({ importStyle: mode !== 'test' })],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: '??????',
        short_name: '????',
        description: 'AI ???????? - ??????????',
        theme_color: '#8B5CF6',
        background_color: '#F8F7FF',
        display: 'standalone',
        orientation: 'portrait',
        // ????????? base?/ai-travel-h5/ ????????????
        start_url: './',
        scope: './',
        icons: [
          {
            src: './favicon.svg',
            sizes: '48x48 72x72 96x96 128x128 144x144 192x192 256x256 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['sw-cleanup.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,json}'],
        // ? precache ??????????????182MB ???/demos/showcase
        // ??????? SW ??? 205MB ???????????/???? ? ??? OOM
        globIgnores: ['**/demos/**', '**/showcase/**', '**/images/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // ?????????????base:'/'??????????? /ai-travel-h5/ ???
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            // ??????????????????????????????
            handler: 'NetworkOnly',
          },
          // ?????B5??OSM ?? CacheFirst?Leaflet ???????
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ????/???best-effort ??????????????????
          {
            urlPattern: /^https:\/\/.*\.(amap|gaode)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'amap-assets',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/uploads': { target: API_TARGET, changeOrigin: true },
      // ???Agent ????? Spring Boot?/api/agent ? 3200 ? 3201??
      // ? Spring ?? JWT ?? + ????????????? Python Agent?
      // SSE ?????????????????SSE ?????? 10 ???
      // ???? 5 ??????? 30 ??????????????????
      '/api/travel': {
        target: API_TARGET,
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
        ws: false,
        configure: sseProxyConfigure,
      },
      '/api/agent': {
        target: API_TARGET,
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
        ws: false,
        configure: sseProxyConfigure,
      },
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
        ws: false,
        configure: sseProxyConfigure,
      },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('highlight.js')) return 'hljs'
          if (id.includes('markdown-it')) return 'mdit'
          if (id.includes('node_modules/vant')) return 'vant-ui'
        },
      },
    },
  },
}))
