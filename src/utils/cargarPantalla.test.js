import { describe, it, expect, vi } from 'vitest'
import { importarConReintento, esFalloDeCargaDeModulo } from './cargarPantalla'

const falloDeRed = () => new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/pages/ClientValidation.jsx')

function almacenFalso() {
  const datos = {}
  return {
    getItem: k => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = v },
    removeItem: k => { delete datos[k] }
  }
}

describe('esFalloDeCargaDeModulo', () => {
  it('reconoce el fallo de descarga de un trozo', () => {
    expect(esFalloDeCargaDeModulo(falloDeRed())).toBe(true)
    expect(esFalloDeCargaDeModulo(new Error('Loading chunk 12 failed'))).toBe(true)
  })
  it('no confunde un error normal de programa', () => {
    expect(esFalloDeCargaDeModulo(new TypeError('x is not a function'))).toBe(false)
  })
})

describe('importarConReintento', () => {
  it('devuelve el módulo si la primera carga va bien', async () => {
    const importar = vi.fn().mockResolvedValue({ default: 'Pantalla' })
    await expect(importarConReintento(importar, { esperaMs: 0 })).resolves.toEqual({ default: 'Pantalla' })
    expect(importar).toHaveBeenCalledTimes(1)
  })

  it('reintenta una vez si falla la descarga y la segunda va bien', async () => {
    const importar = vi.fn().mockRejectedValueOnce(falloDeRed()).mockResolvedValue({ default: 'Pantalla' })
    await expect(importarConReintento(importar, { esperaMs: 0 })).resolves.toEqual({ default: 'Pantalla' })
    expect(importar).toHaveBeenCalledTimes(2)
  })

  it('recarga la página una sola vez si sigue fallando', async () => {
    const importar = vi.fn().mockRejectedValue(falloDeRed())
    const almacen = almacenFalso()
    const ventana = { location: { reload: vi.fn() } }

    const promesa = importarConReintento(importar, { esperaMs: 0, almacen, ventana })
    // No resuelve ni rechaza: la página se está recargando.
    const resultado = await Promise.race([promesa, new Promise(r => setTimeout(() => r('pendiente'), 20))])
    expect(resultado).toBe('pendiente')
    expect(ventana.location.reload).toHaveBeenCalledTimes(1)

    // Tras recargar, si vuelve a fallar, ya no recarga: enseña el error.
    await expect(importarConReintento(importar, { esperaMs: 0, almacen, ventana })).rejects.toThrow(/dynamically imported module/)
    expect(ventana.location.reload).toHaveBeenCalledTimes(1)
  })

  it('una carga buena borra la marca y permite recargar otra vez en el futuro', async () => {
    const almacen = almacenFalso()
    const ventana = { location: { reload: vi.fn() } }
    almacen.setItem('pantalla-recargada', '1')
    await importarConReintento(vi.fn().mockResolvedValue({}), { esperaMs: 0, almacen, ventana })
    expect(almacen.getItem('pantalla-recargada')).toBe(null)
  })

  it('no reintenta ni recarga si el error es de programa', async () => {
    const importar = vi.fn().mockRejectedValue(new TypeError('x is not a function'))
    const ventana = { location: { reload: vi.fn() } }
    await expect(importarConReintento(importar, { esperaMs: 0, almacen: almacenFalso(), ventana })).rejects.toThrow('x is not a function')
    expect(importar).toHaveBeenCalledTimes(1)
    expect(ventana.location.reload).not.toHaveBeenCalled()
  })
})
