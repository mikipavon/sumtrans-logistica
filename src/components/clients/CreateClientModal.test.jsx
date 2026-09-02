// ── La contraseña sólo se puede ver una vez: al ponerla ──
//
// La ficha no guarda contraseñas (supabase/16_contrasenas_con_huella.sql) y
// Supabase Auth conserva sólo una huella cifrada, así que después NO hay forma
// de consultarla. Si el formulario se cierra sin enseñarla, la única salida es
// ponerle otra al cliente — que es exactamente lo que le pasaba a la oficina.
//
// Por eso, cuando un guardado deja cuentas listas, el formulario no se cierra:
// enseña las credenciales para poder dictarlas o pegarlas en un correo. Y sólo
// las que se han creado DE VERDAD: enseñar una cuenta que no llegó a existir es
// mandar al cliente a una puerta cerrada.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CreateClientModal from './CreateClientModal';

// Subir el logo a Storage no pinta nada aquí y arrastra la conexión entera.
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));

const fichaExistente = { id: 77, name: 'PROSERVICE', email: 'gerencia@proservice.es' };

function abrirFicha({ onSave, onClose = vi.fn() }) {
    return render(
        <CreateClientModal
            isOpen
            onClose={onClose}
            onSave={onSave}
            initialData={fichaExistente}
            articles={[]}
            tariffs={[]}
            allPoblaciones={[]}
            allClients={[fichaExistente]}
        />
    );
}

// Escribe una contraseña en "Otros correos con acceso" y guarda.
async function ponerAccesoAdicional(correo, contrasena) {
    fireEvent.click(screen.getByRole('button', { name: /Acceso/i }));
    fireEvent.click(screen.getByRole('button', { name: /Añadir correo/i }));

    fireEvent.change(screen.getByPlaceholderText('dueno@empresa.com'), {
        target: { value: correo },
    });
    // Con el correo ya escrito, la casilla de contraseña cambia de marcador.
    fireEvent.change(screen.getByPlaceholderText('Escríbela para cambiarla'), {
        target: { value: contrasena },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Ficha/i }));
}

describe('CreateClientModal — credenciales recién creadas', () => {
    it('las enseña, con la contraseña a la vista, cuando la cuenta se ha creado', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue({
            ok: true,
            accesosCreados: ['ventas@proservice.es'],
        });

        abrirFicha({ onSave, onClose });
        await ponerAccesoAdicional('ventas@proservice.es', 'HierroLunaCanto47');

        expect(await screen.findByText('Acceso creado')).toBeInTheDocument();
        expect(screen.getByText('ventas@proservice.es')).toBeInTheDocument();
        // Lo que de verdad importa: la contraseña, legible.
        expect(screen.getByText('HierroLunaCanto47')).toBeInTheDocument();

        // Y NO se cierra solo: cerrar aquí sería perderla para siempre.
        expect(onClose).not.toHaveBeenCalled();
    });

    it('no se cierra hasta que se pulsa "Ya lo tengo"', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue({
            ok: true,
            accesosCreados: ['ventas@proservice.es'],
        });

        abrirFicha({ onSave, onClose });
        await ponerAccesoAdicional('ventas@proservice.es', 'HierroLunaCanto47');

        fireEvent.click(await screen.findByRole('button', { name: /Ya lo tengo/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('NO enseña la credencial si la cuenta no se llegó a crear', async () => {
        const onClose = vi.fn();
        // El guardado fue bien, pero Auth rechazó la cuenta (contraseña filtrada,
        // correo de otro, sesión sin permisos...). `accesosCreados` viene vacío.
        const onSave = vi.fn().mockResolvedValue({ ok: true, accesosCreados: [] });

        abrirFicha({ onSave, onClose });
        await ponerAccesoAdicional('ventas@proservice.es', 'HierroLunaCanto47');

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(screen.queryByText('Acceso creado')).not.toBeInTheDocument();
        expect(screen.queryByText('HierroLunaCanto47')).not.toBeInTheDocument();
    });

    it('el botón "Generar" escribe una contraseña dictable en la casilla', async () => {
        abrirFicha({ onSave: vi.fn().mockResolvedValue({ ok: true, accesosCreados: [] }) });

        fireEvent.click(screen.getByRole('button', { name: /Acceso/i }));
        fireEvent.click(screen.getByRole('button', { name: /Añadir correo/i }));
        fireEvent.change(screen.getByPlaceholderText('dueno@empresa.com'), {
            target: { value: 'ventas@proservice.es' },
        });

        const casilla = screen.getByPlaceholderText('Escríbela para cambiarla');
        expect(casilla.value).toBe('');

        // El segundo "Generar" es el de la fila del correo adicional; el primero
        // es el de la contraseña principal de la ficha.
        const botones = screen.getAllByRole('button', { name: /Generar/i });
        expect(botones).toHaveLength(2);
        fireEvent.click(botones[1]);

        // Lleva delante el nombre comercial de la ficha, que es lo que hace que
        // se reconozca de quién es, y detrás dos palabras y cuatro cifras al azar.
        expect(casilla.value).toMatch(/^Proservice([A-Z][a-z]+){2}[0-9]{4}$/);
    });

    it('un guardado sin contraseñas se cierra como siempre', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue({ ok: true, accesosCreados: [] });

        abrirFicha({ onSave, onClose });
        fireEvent.click(screen.getByRole('button', { name: /Guardar Ficha/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(screen.queryByText('Acceso creado')).not.toBeInTheDocument();
    });
});
