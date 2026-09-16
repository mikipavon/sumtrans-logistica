import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVersionNueva } from './useVersionNueva'

const ACTUAL = 'v210+abc1234'
const NUEVA = 'v211+def5678'

const ponerVisibilidad = (estado) => {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useVersionNueva', () => {
  let reloj
  beforeEach(() => {
    vi.useFakeTimers()
    reloj = 1000000
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const montar = (desplegada, extra = {}) => {
    const consultar = vi.fn(async () => desplegada)
    const recargar = vi.fn()
    const hook = renderHook(() => useVersionNueva({
      actual: ACTUAL, consultar, recargar, ahora: () => reloj,
      esperaInicialMs: 1000, cadaMs: 60000, recargarTrasOcultaMs: 5 * 60000, ...extra
    }))
    return { consultar, recargar, hook }
  }

  it('al rato de arrancar pregunta, y si hay versión nueva lo dice sin recargar', async () => {
    const { consultar, recargar, hook } = montar(NUEVA)
    expect(hook.result.current.hayVersionNueva).toBe(false)
    expect(consultar).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(consultar).toHaveBeenCalledTimes(1)
    expect(hook.result.current.hayVersionNueva).toBe(true)
    expect(recargar).not.toHaveBeenCalled()
  })

  it('si la versión es la misma no avisa, y sigue preguntando cada tanto', async () => {
    const { consultar, hook } = montar(ACTUAL)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(hook.result.current.hayVersionNueva).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(consultar).toHaveBeenCalledTimes(2)
    expect(hook.result.current.hayVersionNueva).toBe(false)
  })

  it('al volver al frente tras un rato corto sólo avisa', async () => {
    const { recargar, hook } = montar(NUEVA)

    await act(async () => { ponerVisibilidad('hidden') })
    reloj += 60000
    await act(async () => { ponerVisibilidad('visible') })

    expect(hook.result.current.hayVersionNueva).toBe(true)
    expect(recargar).not.toHaveBeenCalled()
  })

  it('al volver al frente tras mucho rato en segundo plano recarga directamente', async () => {
    const { recargar } = montar(NUEVA)

    await act(async () => { ponerVisibilidad('hidden') })
    reloj += 10 * 60000
    await act(async () => { ponerVisibilidad('visible') })

    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('al volver al frente tras mucho rato, si no hay nada nuevo, no recarga', async () => {
    const { recargar, hook } = montar(ACTUAL)

    await act(async () => { ponerVisibilidad('hidden') })
    reloj += 10 * 60000
    await act(async () => { ponerVisibilidad('visible') })

    expect(recargar).not.toHaveBeenCalled()
    expect(hook.result.current.hayVersionNueva).toBe(false)
  })

  it('el botón Actualizar recarga', async () => {
    const { recargar, hook } = montar(NUEVA)
    act(() => { hook.result.current.actualizar() })
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('sin red no pregunta', async () => {
    const espia = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const { consultar } = montar(NUEVA)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(consultar).not.toHaveBeenCalled()
    } finally {
      espia.mockRestore()
    }
  })

  it('sin versión propia (entorno de pruebas) no hace nada', async () => {
    const consultar = vi.fn(async () => NUEVA)
    renderHook(() => useVersionNueva({ actual: null, consultar, esperaInicialMs: 1000 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(consultar).not.toHaveBeenCalled()
  })
})
