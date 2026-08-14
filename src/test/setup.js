import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Los ficheros de test comparten entorno (ver el comentario de vitest.config.js).
// Testing Library engancha su limpieza automática al importarse, y al reutilizarse
// el módulo eso pasa una sola vez: a partir del segundo fichero, lo que pintaba un
// test se quedaba en el document y el siguiente encontraba dos veces el mismo
// texto. Este setup sí se ejecuta para cada fichero, así que la limpieza va aquí.
afterEach(() => {
  cleanup()
})
