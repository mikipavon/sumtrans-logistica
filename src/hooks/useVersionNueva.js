/**
 * Avisa de que hay una versión nueva desplegada y, cuando es seguro, recarga.
 *
 * Cuándo se pregunta al servidor:
 *   · un rato después de arrancar (sin competir con la carga inicial),
 *   · cada `cadaMs` (5 minutos de serie),
 *   · cada vez que la app vuelve al frente: el cliente cambia de pestaña y vuelve,
 *     o desbloquea el móvil y la app instalada reaparece. Es EL momento en que se
 *     enteran de que hay algo nuevo: la app que llevaba abierta ya no es la que
 *     manda el servidor.
 *
 * Qué se hace al descubrirlo:
 *   · Se enseña un aviso con botón "Actualizar" (ver components/AvisoVersionNueva).
 *   · Si además la app llevaba en segundo plano más de `recargarTrasOcultaMs`
 *     (5 minutos de serie), se recarga directamente: nadie estaba a medio rellenar
 *     nada después de tanto rato, y así al cliente ni le da tiempo a ver lo viejo.
 *     Con menos tiempo fuera no se recarga sola, para no tirarle un formulario a
 *     alguien que sólo fue a mirar un correo.
 *
 * La recarga basta para coger lo nuevo: el HTML llega sin caché y los ficheros de
 * /assets llevan hash en el nombre (ver public/sw.js y vercel.json).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { hayVersionNueva, consultarVersionDesplegada } from '../utils/versionDesplegada'

const versionActual = () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null)
const recargarPagina = () => globalThis.window?.location?.reload()

export function useVersionNueva({
  actual = versionActual(),
  consultar = consultarVersionDesplegada,
  recargar = recargarPagina,
  cadaMs = 5 * 60 * 1000,
  esperaInicialMs = 20 * 1000,
  recargarTrasOcultaMs = 5 * 60 * 1000,
  ahora = Date.now
} = {}) {
  const [nueva, setNueva] = useState(false)
  const comprobando = useRef(false)
  const ocultaDesde = useRef(null)

  useEffect(() => {
    if (!actual) return undefined
    let cancelado = false

    const comprobar = async ({ recargarSiHay = false } = {}) => {
      if (comprobando.current) return
      if (globalThis.navigator && navigator.onLine === false) return
      comprobando.current = true
      try {
        const desplegada = await consultar()
        if (cancelado || !hayVersionNueva(actual, desplegada)) return
        if (recargarSiHay) {
          recargar()
          return
        }
        setNueva(true)
      } finally {
        comprobando.current = false
      }
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        ocultaDesde.current = ahora()
        return
      }
      const fuera = ocultaDesde.current != null ? ahora() - ocultaDesde.current : 0
      ocultaDesde.current = null
      comprobar({ recargarSiHay: fuera >= recargarTrasOcultaMs })
    }
    const alEnfocar = () => comprobar()

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('focus', alEnfocar)
    const inicial = setTimeout(() => comprobar(), esperaInicialMs)
    const periodica = setInterval(() => comprobar(), cadaMs)

    return () => {
      cancelado = true
      clearTimeout(inicial)
      clearInterval(periodica)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('focus', alEnfocar)
    }
  }, [actual, consultar, recargar, cadaMs, esperaInicialMs, recargarTrasOcultaMs, ahora])

  const actualizar = useCallback(() => recargar(), [recargar])

  return { hayVersionNueva: nueva, actualizar }
}
