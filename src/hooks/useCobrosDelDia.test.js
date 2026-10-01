// El caso del 01/10/2026: la oficina cobra un porte desde el ordenador entrando
// como el repartidor, y al repartidor no le sale en la Cuenta del móvil.
//
// Aquí cada "aparato" es un hook montado con su propio localStorage, y los dos
// comparten una nube de mentira (la fila del conductor).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCobrosDelDia, claveCobrosEnLaNube } from './useCobrosDelDia'

const DIA = '2026-10-01'
const CLAVE = claveCobrosEnLaNube(DIA)
const JAVITO = 5

const delMovil = { id: 'COL-1-HAB-834-porte-w85z', shipmentId: 'HAB-834', type: 'Porte', amount: '7.00', date: DIA }
const delOrdenador = { id: 'COL-2-SUM-3217-porte', shipmentId: 'SUM-3217', type: 'Porte', amount: '7.00', date: DIA }
const otroDelMovil = { id: 'COL-3-HAB-840-porte', shipmentId: 'HAB-840', type: 'Porte', amount: '9.00', date: DIA }

const ids = (lista) => (lista || []).map(c => c.id).sort()

describe('useCobrosDelDia', () => {
  let nube
  let leerDatos
  let guardarDatos

  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    nube = { routeOrder: ['HAB-834'] }
    leerDatos = vi.fn(async () => ({ ...nube }))
    guardarDatos = vi.fn(async (_id, datos) => { nube = datos })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // Deja correr las lecturas y subidas pendientes
  const asentar = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }) }

  const abrirAparato = async (cobrosEnLaNube) => {
    const aparato = renderHook(
      (props) => useCobrosDelDia({ conductorId: JAVITO, dia: DIA, leerDatos, guardarDatos, ...props }),
      { initialProps: { cobrosEnLaNube } }
    )
    await asentar()
    return aparato
  }
  const apuntar = async (aparato, cobro) => {
    act(() => { aparato.result.current[1](prev => [...prev, cobro]) })
    await asentar()
  }

  it('lo que se apunta se sube a la nube sin tocar el resto de la fila', async () => {
    const movil = await abrirAparato()
    await apuntar(movil, delMovil)

    expect(ids(nube[CLAVE])).toEqual(ids([delMovil]))
    expect(nube.routeOrder).toEqual(['HAB-834'])
  })

  it('al móvil ya abierto le llega el cobro que se apuntó desde el ordenador', async () => {
    const movil = await abrirAparato()
    await apuntar(movil, delMovil)

    // El ordenador de la oficina, entrando como Javito, cobra otro porte
    localStorage.clear()
    const ordenador = await abrirAparato(nube[CLAVE])
    await apuntar(ordenador, delOrdenador)
    expect(ids(ordenador.result.current[0])).toEqual(ids([delMovil, delOrdenador]))

    // Al móvil le llega la fila del conductor (Realtime o refresco)
    movil.rerender({ cobrosEnLaNube: nube[CLAVE] })
    await asentar()

    expect(ids(movil.result.current[0])).toEqual(ids([delMovil, delOrdenador]))
  })

  it('el siguiente cobro del móvil no borra de la nube el del ordenador, aunque no le haya llegado el aviso', async () => {
    const movil = await abrirAparato()
    await apuntar(movil, delMovil)

    // El ordenador apunta el suyo directamente en la nube; al móvil no le llega nada
    nube = { ...nube, [CLAVE]: [...nube[CLAVE], delOrdenador] }

    await apuntar(movil, otroDelMovil)

    expect(ids(nube[CLAVE])).toEqual(ids([delMovil, delOrdenador, otroDelMovil]))
    expect(ids(movil.result.current[0])).toEqual(ids([delMovil, delOrdenador, otroDelMovil]))
  })

  it('al abrir la app recoge lo de la nube y sube lo que sólo tenía el aparato', async () => {
    localStorage.setItem(`drv_collections_${JAVITO}_${DIA}`, JSON.stringify([delMovil]))
    nube = { ...nube, [CLAVE]: [delOrdenador] }

    const movil = await abrirAparato()

    expect(ids(movil.result.current[0])).toEqual(ids([delMovil, delOrdenador]))
    expect(ids(nube[CLAVE])).toEqual(ids([delMovil, delOrdenador]))
  })

  it('no vuelve a escribir la fila si la nube ya lo tiene todo', async () => {
    nube = { ...nube, [CLAVE]: [delMovil] }
    localStorage.setItem(`drv_collections_${JAVITO}_${DIA}`, JSON.stringify([delMovil]))

    const movil = await abrirAparato([delMovil])
    movil.rerender({ cobrosEnLaNube: [delMovil] })
    await asentar()

    expect(guardarDatos).not.toHaveBeenCalled()
  })

  it('sin cobertura se queda con lo suyo y no rompe', async () => {
    leerDatos.mockImplementation(async () => null)
    const movil = await abrirAparato()
    await apuntar(movil, delMovil)

    expect(ids(movil.result.current[0])).toEqual(ids([delMovil]))
    expect(JSON.parse(localStorage.getItem(`drv_collections_${JAVITO}_${DIA}`))).toHaveLength(1)
    expect(guardarDatos).not.toHaveBeenCalled()
  })
})
