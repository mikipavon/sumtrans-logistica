/**
 * Sube en uno el número de versión de la app.
 *
 * Ejecutar antes de commitear un cambio que vaya a desplegarse:
 *   npm run subir-version
 *
 * Es el número que ve el repartidor en el Portal del Empleado y el que va a
 * `error_logs`. Vive en version.json, dentro del repositorio, porque el servidor de
 * despliegue clona el repositorio recortado: allí no se puede contar la historia de
 * git, y cualquier número calculado en la compilación sale mal.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ruta = new URL('../version.json', import.meta.url)
const datos = JSON.parse(readFileSync(ruta, 'utf-8'))
const anterior = Number(datos.numero)

if (!Number.isFinite(anterior)) {
  console.error('version.json no tiene un "numero" válido.')
  process.exit(1)
}

datos.numero = anterior + 1
writeFileSync(ruta, JSON.stringify(datos, null, 2) + '\n')
console.log(`Versión de la app: ${anterior} → ${datos.numero}`)
