import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// El número de package.json no se toca nunca, así que por sí solo no dice con qué
// despliegue está trabajando un repartidor. Se le pega el commit y la fecha de
// compilación: eso sí cambia cada vez, y es lo que se enseña en el Portal del Empleado.
const commit = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'local'
  }
})()
const fechaDeCompilacion = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  // Para poder saber con qué versión petó el móvil de un repartidor (ver utils/errorLog).
  define: {
    __APP_VERSION__: JSON.stringify(`${version}+${commit}`),
    __APP_BUILD_DATE__: JSON.stringify(fechaDeCompilacion)
  },
  base: '/',
  server: {
    host: true,
    https: false,
    allowedHosts: 'all'
  }
})
