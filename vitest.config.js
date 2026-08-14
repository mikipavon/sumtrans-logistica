import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',

    // ── Por qué esto no son los ajustes de serie ──
    // El proyecto vive dentro de una carpeta de OneDrive, y cada lectura de
    // node_modules pasa por el filtro de sincronización. Levantar un worker
    // (vitest + jsdom + el setup) tardaba ahí más de los 60 segundos que espera
    // vitest, que además son una constante suya, no un ajuste. Con los valores
    // de serie no arrancaba ni un solo test: "Timeout waiting for worker to
    // respond" en todos los ficheros.
    //
    // - threads en vez de forks: hilos dentro del mismo proceso, sin volver a
    //   cargar node entero por fichero.
    // - un solo hilo y sin aislar: el entorno se monta UNA vez y se reutiliza
    //   para todos los ficheros, que es lo caro. A cambio, los tests comparten
    //   globals entre ficheros: si algún día uno ensucia el document o un mock
    //   global, hay que limpiarlo en su propio afterEach.
    //
    // maxWorkers/minWorkers van sueltos a propósito: en Vitest 4 desapareció
    // poolOptions y estas opciones subieron al primer nivel.
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    isolate: false,
  },
})
