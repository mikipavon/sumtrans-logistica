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

// El número de versión es el conteo de commits: sube solo con cada cambio, sin que
// nadie tenga que acordarse de tocarlo. El suelo de version.json es el seguro: si el
// servidor de despliegue clona el repositorio recortado, el conteo saldría bajísimo y
// la versión bajaría de golpe. Nunca baja.
const numeroDeVersion = (() => {
  const { minimo } = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf-8'))
  try {
    const superficial = execSync('git rev-parse --is-shallow-repository', { encoding: 'utf-8' }).trim()
    if (superficial !== 'true') {
      const conteo = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim(), 10)
      if (Number.isFinite(conteo)) return Math.max(conteo, minimo)
    }
  } catch { /* sin git: nos quedamos con el suelo */ }
  return minimo
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
