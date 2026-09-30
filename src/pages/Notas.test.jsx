import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Una tabla notas_oficina de mentira, en memoria, con lo justo del cliente de
// Supabase que usa la pantalla.
const tabla = vi.hoisted(() => ({ filas: [], almacen: new Map(), borradas: [] }));

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
  const storage = {
    from: () => ({
      upload: async (ruta, cuerpo) => { tabla.almacen.set(ruta, cuerpo); return { error: null }; },
      download: async (ruta) => ({ data: tabla.almacen.get(ruta), error: null }),
      createSignedUrl: async (ruta) => ({ data: { signedUrl: 'https://firmado/' + ruta }, error: null }),
      remove: async (rutas) => { rutas.forEach((r) => { tabla.almacen.delete(r); tabla.borradas.push(r); }); return { error: null }; },
    }),
  };
  return { supabase: { from: () => consulta(), storage } };
});

import Notas from './Notas';

beforeEach(() => {
  cleanup();
  tabla.filas = [];
  tabla.almacen = new Map();
  tabla.borradas = [];
  URL.createObjectURL = vi.fn(() => 'blob:descifrada');
  URL.revokeObjectURL = vi.fn();
});

const captura = () => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])], 'captura.png', { type: 'image/png' });

const abrirLibretaNueva = async () => {
  fireEvent.click(await screen.findByText(/Contraseñas/));
  fireEvent.change(screen.getByPlaceholderText('Llave maestra'), { target: { value: 'llave-de-prueba' } });
  fireEvent.change(screen.getByPlaceholderText('Repite la llave maestra'), { target: { value: 'llave-de-prueba' } });
  fireEvent.click(screen.getByText('Crear y abrir'));
  fireEvent.click(await screen.findByText('Nueva contraseña', {}, { timeout: 5000 }));
};

describe('pestaña Notas', () => {
  it('una nota nueva se guarda sola al dejar de escribir', async () => {
    render(<Notas />);
    fireEvent.click(await screen.findByText('Nueva nota'));
    const texto = await screen.findByPlaceholderText(/Escribe aquí/);
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

  it('una captura pegada con Ctrl+V se queda en la nota, sin cifrar', async () => {
    render(<Notas />);
    fireEvent.click(await screen.findByText('Nueva nota'));
    const texto = await screen.findByPlaceholderText(/Escribe aquí/);
    fireEvent.paste(texto, { clipboardData: { files: [captura()] } });

    await waitFor(() => expect(tabla.filas[0].imagenes).toHaveLength(1));
    const img = tabla.filas[0].imagenes[0];
    expect(img.cifrada).toBe(false);
    expect(tabla.almacen.get(img.ruta).type).toBe('image/png');
    expect(await screen.findByAltText('captura.png')).toBeTruthy();
  });

  it('la imagen de una contraseña se sube cifrada y se ve descifrada', async () => {
    render(<Notas />);
    await abrirLibretaNueva();
    fireEvent.change(screen.getByPlaceholderText(/Nombre/), { target: { value: 'Centralita' } });
    const entrada = document.querySelector('input[type=file]');
    fireEvent.change(entrada, { target: { files: [captura()] } });
    await screen.findByAltText('captura.png');

    const [ruta, subida] = [...tabla.almacen.entries()][0];
    expect(subida.type).toBe('application/octet-stream');
    const bytes = new Uint8Array(await subida.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(8);
    expect(Array.from(bytes.slice(12, 16))).not.toEqual([137, 80, 78, 71]);

    fireEvent.click(screen.getByText('Guardar'));
    await screen.findByText('Centralita');
    const guardada = tabla.filas.find((f) => f.tipo === 'clave');
    expect(guardada.imagenes).toEqual([expect.objectContaining({ ruta, cifrada: true })]);
    expect(URL.createObjectURL).toHaveBeenCalled();
  }, 20000);

  it('si se cancela la contraseña, la imagen subida se borra', async () => {
    render(<Notas />);
    await abrirLibretaNueva();
    fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [captura()] } });
    await screen.findByAltText('captura.png');
    const ruta = [...tabla.almacen.keys()][0];

    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(tabla.borradas).toContain(ruta));
  }, 20000);
});
