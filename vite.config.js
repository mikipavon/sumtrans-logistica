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
const versionDeLaApp = `v${numeroDeVersion}+${commit}`

// Fichero /version-desplegada.json, junto al index.html, con la versión que hay en
// el servidor. La app lo consulta de vez en cuando (ver hooks/useVersionNueva) para
// enterarse de que se ha desplegado algo nuevo: sin esto, una pestaña que lleva
// abierta desde por la mañana —o la app instalada en el móvil de un cliente— sigue
// con el JavaScript viejo hasta que alguien recarga a mano.
//
// En Vercel sale con Cache-Control: no-store (vercel.json, la regla de /(.*)), así
// que cada consulta llega al servidor. En desarrollo lo sirve el propio servidor.
const NOMBRE_VERSION_DESPLEGADA = 'version-desplegada.json'
const contenidoVersionDesplegada = () =>
  JSON.stringify({ version: versionDeLaApp, numero: numeroDeVersion, fecha: fechaDeCompilacion })

const versionDesplegada = () => ({
  name: 'version-desplegada',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: NOMBRE_VERSION_DESPLEGADA, source: contenidoVersionDesplegada() })
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req.url || '').split('?')[0] !== `/${NOMBRE_VERSION_DESPLEGADA}`) return next()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(contenidoVersionDesplegada())
    })
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionDesplegada()
  ],
  // Para poder saber con qué versión petó el móvil de un repartidor (ver utils/errorLog).
  define: {
    __APP_VERSION__: JSON.stringify(versionDeLaApp),
    __APP_BUILD_NUMBER__: numeroDeVersion,
    __APP_BUILD_DATE__: JSON.stringify(fechaDeCompilacion)
  },
  base: '/',
  server: {
    host: true,
    https: false,
    allowedHosts: 'all',
    // Sólo afecta a la ventana de pruebas, nunca a lo que se despliega.
    // Sin esto, la primera vez que se pincha cada pestaña el servidor prepara sus
    // ficheros en ese momento y se nota la espera. Así los deja listos al arrancar.
    warmup: {
      clientFiles: [
        './src/pages/Shipments.jsx',
        './src/pages/Clients.jsx',
        './src/pages/Drivers.jsx',
        './src/pages/Dashboard.jsx',
        './src/pages/PendingCollections.jsx',
        './src/pages/Incidents.jsx',
        './src/pages/driver/DriverDashboard.jsx',
      ]
    }
  }
})
