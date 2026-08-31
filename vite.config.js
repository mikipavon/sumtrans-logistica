import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// El número de package.json no se toca nunca, así que por sí solo no dice con qué
// despliegue está trabajando un repartidor. Lo que se enseña es un número que sube
// con cada cambio, la fecha de compilación y el commit.
const commit = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'local'
  }
})()

// El número de versión sale de version.json y de ningún otro sitio.
//
// Antes se calculaba contando los commits, y en el despliegue salía mal: Vercel clona
// el repositorio recortado, así que allí no hay historia que contar. La primera vez que
// se desplegó, producción se quedó en 172 mientras aquí ponía 181. Cualquier número
// calculado durante la compilación tiene ese problema; éste viaja dentro del repositorio.
//
// Se sube con: npm run subir-version
const numeroDeVersion = (() => {
  const { numero } = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf-8'))
  return Number(numero) || 0
})()

const fechaDeCompilacion = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  // Para poder saber con qué versión petó el móvil de un repartidor (ver utils/errorLog).
  define: {
    __APP_VERSION__: JSON.stringify(`v${numeroDeVersion}+${commit}`),
    __APP_BUILD_NUMBER__: numeroDeVersion,
    __APP_BUILD_DATE__: JSON.stringify(fechaDeCompilacion)
  },
  base: '/',
  server: {
    host: true,
    https: false,
    allowedHosts: 'all'
  }
})
