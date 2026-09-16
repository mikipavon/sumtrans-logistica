import { describe, it, expect, vi } from 'vitest'
import { hayVersionNueva, consultarVersionDesplegada, RUTA_VERSION_DESPLEGADA } from './versionDesplegada'

describe('hayVersionNueva', () => {
  it('avisa cuando la versión desplegada es distinta de la que corre', () => {
    expect(hayVersionNueva('v210+abc1234', 'v211+def5678')).toBe(true)
    // Mismo número pero otro commit: alguien olvidó subir la versión, pero el código cambió.
    expect(hayVersionNueva('v210+abc1234', 'v210+def5678')).toBe(true)
  })

  it('no avisa cuando es la misma', () => {
    expect(hayVersionNueva('v210+abc1234', 'v210+abc1234')).toBe(false)
    expect(hayVersionNueva('v210+abc1234', ' v210+abc1234\n')).toBe(false)
  })

  it('ante la duda no avisa', () => {
    expect(hayVersionNueva('v210+abc1234', null)).toBe(false)
    expect(hayVersionNueva('v210+abc1234', undefined)).toBe(false)
    expect(hayVersionNueva('v210+abc1234', '')).toBe(false)
    expect(hayVersionNueva(undefined, 'v211+def5678')).toBe(false)
    expect(hayVersionNueva('', 'v211+def5678')).toBe(false)
    expect(hayVersionNueva('v210+abc1234', { version: 'v211+def5678' })).toBe(false)
  })
})

const respuestaJson = (cuerpo, { ok = true, tipo = 'application/json; charset=utf-8' } = {}) => ({
  ok,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? tipo : null) },
  json: async () => cuerpo
})

describe('consultarVersionDesplegada', () => {
  it('devuelve la versión del fichero y pregunta al servidor sin caché', async () => {
    const fetchFn = vi.fn(async () => respuestaJson({ version: 'v211+def5678', numero: 211 }))
    const version = await consultarVersionDesplegada(fetchFn, () => 1234)

    expect(version).toBe('v211+def5678')
    const [url, opciones] = fetchFn.mock.calls[0]
    expect(url).toBe(`${RUTA_VERSION_DESPLEGADA}?t=1234`)
    expect(opciones.cache).toBe('no-store')
  })

  it('devuelve null si el servidor contesta con el index.html en vez del JSON', async () => {
    const fetchFn = vi.fn(async () => respuestaJson('<!doctype html>', { tipo: 'text/html; charset=utf-8' }))
    expect(await consultarVersionDesplegada(fetchFn)).toBe(null)
  })

  it('devuelve null si la respuesta no es correcta, no tiene versión o falla la red', async () => {
    expect(await consultarVersionDesplegada(async () => respuestaJson({}, { ok: false }))).toBe(null)
    expect(await consultarVersionDesplegada(async () => respuestaJson({ numero: 211 }))).toBe(null)
    expect(await consultarVersionDesplegada(async () => respuestaJson({ version: '   ' }))).toBe(null)
    expect(await consultarVersionDesplegada(async () => { throw new TypeError('Failed to fetch') })).toBe(null)
    expect(await consultarVersionDesplegada(undefined)).toBe(null)
  })
})
