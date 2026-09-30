import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Una tabla notas_oficina de mentira, en memoria, con lo justo del cliente de
// Supabase que usa la pantalla.
const tabla = vi.hoisted(() => ({ filas: [] }));

vi.mock('../lib/supabase', () => {
  const consulta = () => {
    let accion = 'select';
    let datos = null;
    let id = null;
    const q = {
      select: () => q,
      order: () => q,
      single: () => q,
      insert: (fila) => { accion = 'insert'; datos = fila; return q; },
      update: (cambios) => { accion = 'update'; datos = cambios; return q; },
      delete: () => { accion = 'delete'; return q; },
      eq: (_c, v) => { id = v; return q; },
      then: (cb) => {
        let data = null;
        if (accion === 'select') data = [...tabla.filas];
        if (accion === 'insert') {
          data = { id: `id-${tabla.filas.length + 1}`, titulo: '', texto: '', web: '', usuario: '', updated_at: new Date().toISOString(), ...datos };
          tabla.filas.unshift(data);
        }
        if (accion === 'update') {
          tabla.filas = tabla.filas.map((f) => (f.id === id ? { ...f, ...datos } : f));
          data = tabla.filas.filter((f) => f.id === id);
        }
        if (accion === 'delete') tabla.filas = tabla.filas.filter((f) => f.id !== id);
        return Promise.resolve({ data, error: null }).then(cb);
      },
    };
    return q;
  };
  return { supabase: { from: () => consulta() } };
});

import Notas from './Notas';

beforeEach(() => {
  cleanup();
  tabla.filas = [];
});

describe('pestaña Notas', () => {
  it('una nota nueva se guarda sola al dejar de escribir', async () => {
    render(<Notas />);
    fireEvent.click(await screen.findByText('Nueva nota'));
    const texto = await screen.findByPlaceholderText('Escribe aquí…');
    fireEvent.change(texto, { target: { value: 'Llamar a SEUR el lunes' } });
    fireEvent.blur(texto);

    await waitFor(() => expect(tabla.filas[0].texto).toBe('Llamar a SEUR el lunes'));
    expect(tabla.filas[0].tipo).toBe('nota');
  });

  it('la contraseña se guarda cifrada y sólo la llave buena vuelve a abrirla', async () => {
    render(<Notas />);
    fireEvent.click(await screen.findByText(/Contraseñas/));

    fireEvent.change(screen.getByPlaceholderText('Llave maestra'), { target: { value: 'llave-de-prueba' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la llave maestra'), { target: { value: 'llave-de-prueba' } });
    fireEvent.click(screen.getByText('Crear y abrir'));

    fireEvent.click(await screen.findByText('Nueva contraseña', {}, { timeout: 5000 }));
    fireEvent.change(screen.getByPlaceholderText(/Nombre/), { target: { value: 'Factusol' } });
    fireEvent.change(screen.getByPlaceholderText('Usuario o correo'), { target: { value: 'oficina' } });
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'Secreta#123' } });
    fireEvent.click(screen.getByText('Guardar'));

    await screen.findByText('Factusol');
    const guardada = tabla.filas.find((f) => f.tipo === 'clave');
    expect(guardada.clave_cifrada.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(tabla.filas)).not.toContain('Secreta#123');

    // Se ve al pulsar el ojo.
    fireEvent.click(screen.getByTitle('Ver'));
    expect(await screen.findByText('Secreta#123')).toBeTruthy();

    // Cerrar y volver a abrir con otra llave no deja pasar.
    fireEvent.click(screen.getByText('Cerrar libreta'));
    fireEvent.change(screen.getByPlaceholderText('Llave maestra'), { target: { value: 'otra-llave-mala' } });
    fireEvent.click(screen.getByText('Abrir'));
    expect(await screen.findByText('Esa no es la llave maestra.', {}, { timeout: 5000 })).toBeTruthy();
  }, 20000);
});
