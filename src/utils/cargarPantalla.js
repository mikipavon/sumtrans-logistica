import { lazy } from 'react'

/**
 * Carga diferida de una pantalla que no se rinde a la primera.
 *
 * Con `lazy(() => import(...))` a secas, si el navegador no consigue bajar el trozo
 * de la pantalla (se ha reiniciado el servidor de desarrollo, OneDrive estaba
 * sincronizando el fichero, o en producción se acaba de desplegar y el trozo
 * antiguo ya no existe), React lanza "Failed to fetch dynamically imported module"
 * y la aplicación entera se va a la pantalla roja. Aquí pasaba de vez en cuando.
 *
 * Esto hace dos cosas antes de rendirse:
 *   1. Espera un momento y vuelve a pedir el trozo.
 *   2. Si sigue sin llegar, recarga la página UNA vez (así el navegador coge el
 *      índice nuevo con los nombres de trozo actuales). La marca en sessionStorage
 *      evita recargar en bucle si el fallo es de verdad.
 */
const CLAVE_RECARGA = 'pantalla-recargada'

export function esFalloDeCargaDeModulo(error) {
  const texto = String(error?.message || error || '')
  return /dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk|error loading dynamically imported module/i.test(texto)
}

export async function importarConReintento(importar, { esperaMs = 1500, reintentos = 1, recargar = true, almacen = globalThis.sessionStorage, ventana = globalThis.window } = {}) {
  let ultimoError
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const modulo = await importar()
      try { almacen?.removeItem(CLAVE_RECARGA) } catch { /* sin almacenamiento */ }
      return modulo
    } catch (error) {
      ultimoError = error
      if (!esFalloDeCargaDeModulo(error)) throw error
      if (intento < reintentos) await new Promise(r => setTimeout(r, esperaMs))
    }
  }

  let yaRecargada = false
  try { yaRecargada = almacen?.getItem(CLAVE_RECARGA) === '1' } catch { /* sin almacenamiento */ }
  if (recargar && !yaRecargada && ventana?.location) {
    try { almacen?.setItem(CLAVE_RECARGA, '1') } catch { /* sin almacenamiento */ }
    ventana.location.reload()
    // La página se va a recargar: devolvemos una promesa que no resuelve nunca para
    // que React se quede en el "cargando" en vez de pintar el error un instante.
    return new Promise(() => {})
  }
  throw ultimoError
}

export function cargarPantalla(importar) {
  return lazy(() => importarConReintento(importar))
}
