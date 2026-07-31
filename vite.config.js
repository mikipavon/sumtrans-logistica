import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  // Para poder saber con qué versión petó el móvil de un repartidor (ver utils/errorLog).
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  base: '/',
  server: {
    host: true,
    https: false,
    allowedHosts: 'all'
  }
})
