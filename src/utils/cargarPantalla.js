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

/**
 * Recarga la página, pero no dos veces seguidas.
 *
 * La marca de arriba se borra en cuanto baja bien cualquier pantalla, así que no
 * frena el caso de que unas bajen y otra no: la app recargaba, volvía a fallar y
 * volvía a recargar. Al repartidor le parpadeaba el móvil y Vercel, viendo tantas
 * peticiones seguidas, le ponía delante su «Estamos verificando tu navegador»
 * (01/10/2026, tras tres despliegues en media hora). Aquí se apunta la hora de la
 * última recarga y no se repite hasta pasado un rato; mientras, el fallo sigue su
 * curso y sale el aviso con el botón de «Volver a abrir».
 */
const CLAVE_HORA_RECARGA = 'pantalla-recargada-a-las'
const ESPERA_ENTRE_RECARGAS_MS = 60000

export function recargarConFreno({ almacen = globalThis.sessionStorage, ventana = globalThis.window, ahora = Date.now() } = {}) {
  if (!ventana?.location) return false
  let ultima = 0
  try { ultima = Number(almacen?.getItem(CLAVE_HORA_RECARGA)) || 0 } catch { /* sin almacenamiento */ }
  if (ultima && ahora - ultima < ESPERA_ENTRE_RECARGAS_MS) return false
  // Sin almacenamiento no hay forma de saber si ya se recargó: mejor el aviso que el bucle.
  try { almacen.setItem(CLAVE_HORA_RECARGA, String(ahora)) } catch { return false }
  ventana.location.reload()
  return true
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
  if (recargar && !yaRecargada && recargarConFreno({ almacen, ventana })) {
    try { almacen?.setItem(CLAVE_RECARGA, '1') } catch { /* sin almacenamiento */ }
    // La página se va a recargar: devolvemos una promesa que no resuelve nunca para
    // que React se quede en el "cargando" en vez de pintar el error un instante.
    return new Promise(() => {})
  }
  throw ultimoError
}

export function cargarPantalla(importar) {
  return lazy(() => importarConReintento(importar))
}
