/**
 * ¿Hay una versión más nueva desplegada que la que lleva esta pestaña?
 *
 * El problema que resuelve: se despliega un cambio y un cliente sigue viendo la
 * versión anterior. No es la caché del servidor (el HTML sale con no-store y los
 * ficheros de /assets cambian de nombre en cada despliegue): es que la app, una vez
 * arrancada, no vuelve a pedir nada al servidor. Una pestaña abierta desde por la
 * mañana, o la app instalada en el móvil y "abierta" desde las aplicaciones
 * recientes, sigue ejecutando el JavaScript viejo hasta que alguien recarga.
 *
 * La compilación deja junto al index.html un /version-desplegada.json con la
 * versión del servidor (ver vite.config.js). Aquí se consulta y se compara con la
 * versión que Vite grabó dentro de este JavaScript (__APP_VERSION__).
 */

export const RUTA_VERSION_DESPLEGADA = '/version-desplegada.json'

/**
 * Compara la versión que corre en esta pestaña con la desplegada.
 * Devuelve false ante cualquier duda: mejor no avisar que avisar en falso y meter
 * al cliente en un bucle de recargas.
 */
export function hayVersionNueva(actual, desplegada) {
  if (typeof actual !== 'string' || typeof desplegada !== 'string') return false
  if (!actual.trim() || !desplegada.trim()) return false
  return actual.trim() !== desplegada.trim()
}

/**
 * Pide al servidor la versión desplegada. Devuelve la cadena de versión o null si
 * no se puede saber (sin red, el fichero no existe todavía, respuesta rara...).
 *
 * `cache: 'no-store'` y el parámetro con la hora evitan que el navegador o un
 * proxy intermedio contesten con una copia guardada: la gracia es preguntar de
 * verdad al servidor.
 */
export async function consultarVersionDesplegada(fetchFn = globalThis.fetch, ahora = Date.now) {
  if (typeof fetchFn !== 'function') return null
  try {
    const respuesta = await fetchFn(`${RUTA_VERSION_DESPLEGADA}?t=${ahora()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
    if (!respuesta?.ok) return null
    // Si el fichero no existe, Vercel contesta con el index.html (regla de rewrites)
    // y un 200: eso no es una versión.
    const tipo = respuesta.headers?.get?.('content-type') || ''
    if (!/json/i.test(tipo)) return null
    const datos = await respuesta.json()
    return typeof datos?.version === 'string' && datos.version.trim() ? datos.version.trim() : null
  } catch {
    return null
  }
}
