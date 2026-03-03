import { resolve } from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['CNPJA_'])

  return {
    root: resolve(__dirname, 'src/renderer'),
    envDir: resolve(__dirname),
    publicDir: resolve(__dirname, 'resources'),

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },

    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },

    plugins: [react(), tailwindcss()],

    build: {
      outDir: resolve(__dirname, 'dist-web'),
      emptyOutDir: true
    },

    server: {
      port: 5180,
      proxy: {
        '/api/cnpj': {
          target: 'https://api.cnpja.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cnpj/, '/office'),
          headers: {
            Authorization: env.CNPJA_API_TOKEN || env.CNPJA_API_TOKEN2 || ''
          }
        },
        '/storage-proxy': {
          target: 'https://firebasestorage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/storage-proxy/, '')
        }
      }
    }
  }
})
