import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  // Carrega variáveis do .env com prefixo CNPJA_ para injetar no processo main
  const env = loadEnv(mode, process.cwd(), ['CNPJA_'])

  return {
    main: {
      // Substitui process.env.CNPJA_* em tempo de build para funcionar no .exe
      define: {
        'process.env.CNPJA_API_TOKEN': JSON.stringify(env.CNPJA_API_TOKEN ?? ''),
        'process.env.CNPJA_API_TOKEN2': JSON.stringify(env.CNPJA_API_TOKEN2 ?? '')
      }
    },
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
