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

// ── Una sede rellena su C.P. al escribir la población ──
//
// En la pestaña Sedes la población se guardaba tal cual y el C.P. había que
// teclearlo aparte, cuando el alta de envíos ya lo sacaba del listado de pueblos.
describe('CreateClientModal — sedes', () => {
    it('al poner la población de la sede se rellenan el C.P. y la provincia', () => {
        abrirFicha({ onSave: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: /Sedes/i }));
        fireEvent.click(screen.getByRole('button', { name: /Añadir Sede/i }));
        fireEvent.change(screen.getByPlaceholderText('Baena'), { target: { value: 'Lucena' } });

        expect(screen.getByPlaceholderText('14850').value).toBe('14900');
        expect(screen.getByPlaceholderText('Córdoba').value).toMatch(/C[oó]rdoba/i);
    });

    it('un pueblo que no está en el listado deja el C.P. como estaba', () => {
        abrirFicha({ onSave: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: /Sedes/i }));
        fireEvent.click(screen.getByRole('button', { name: /Añadir Sede/i }));
        fireEvent.change(screen.getByPlaceholderText('14850'), { target: { value: '14999' } });
        fireEvent.change(screen.getByPlaceholderText('Baena'), { target: { value: 'Pueblo Inventado' } });

        expect(screen.getByPlaceholderText('14850').value).toBe('14999');
    });
});

// ── La pestaña Dirección, igual que las sedes ──
//
// La población principal sólo miraba las tarifas por zona, que guardan el
// principio del C.P. ("14"): o no rellenaba nada o dejaba el C.P. a medias.
// La operativa no rellenaba nada.
// Población y Provincia llevan el mismo marcador (Madrid); la población es la del desplegable.
const poblacionPrincipal = () => screen.getAllByPlaceholderText('Madrid').find(el => el.getAttribute('list'));

describe('CreateClientModal — pestaña Dirección', () => {
    it('la población rellena el C.P. completo, la provincia y el país', () => {
        abrirFicha({ onSave: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: /Dir\./i }));
        fireEvent.change(poblacionPrincipal(), { target: { value: 'Lucena' } });

        expect(screen.getByPlaceholderText('28001').value).toBe('14900');
        expect(screen.getByPlaceholderText('España').value).toBe('España');
        const provincia = screen.getAllByPlaceholderText('Madrid').find(el => !el.getAttribute('list'));
        expect(provincia.value).toMatch(/C[oó]rdoba/i);
    });

    it('con una tarifa de zona para el pueblo no escribe el prefijo como C.P.', () => {
        render(
            <CreateClientModal isOpen onClose={vi.fn()} onSave={vi.fn()} initialData={fichaExistente}
                articles={[]} allPoblaciones={[]} allClients={[fichaExistente]}
                tariffs={[{ id: 't1', match: 'Lucena', zipPrefix: '14', province: 'Córdoba' }]} />
        );

        fireEvent.click(screen.getByRole('button', { name: /Dir\./i }));
        fireEvent.change(poblacionPrincipal(), { target: { value: 'Lucena' } });

        expect(screen.getByPlaceholderText('28001').value).toBe('14900');
    });

    it('la población operativa rellena el C.P. operativo', () => {
        abrirFicha({ onSave: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: /Dir\./i }));
        fireEvent.change(screen.getByPlaceholderText('Córdoba'), { target: { value: 'Cabra' } });

        expect(screen.getByPlaceholderText('14001').value).toBe('14940');
    });
});

// ── La prioridad va con la base de datos ──
//
// Los destinatarios de una agencia van Estándar y los clientes de SUM Urgente.
// Antes todo abría Urgente, y como las fichas de agencia se crean solas sin
// prioridad, al guardarlas se quedaban Urgente para siempre.
describe('CreateClientModal — prioridad según la base de datos', () => {
    const xpo = { id: 9, name: 'XPO', isAgency: true };
    const urgente = () => screen.getByRole('radio', { name: /Urgente/i });
    const estandar = () => screen.getByRole('radio', { name: /Estándar/i });
    // La etiqueta "Base de Datos" no está enlazada al select: se llega por su opción.
    const baseDeDatos = () => screen.getByRole('option', { name: /XPO/ }).closest('select');

    function abrir(ficha) {
        return render(
            <CreateClientModal isOpen onClose={vi.fn()} onSave={vi.fn()} initialData={ficha}
                articles={[]} tariffs={[]} allPoblaciones={[]} allClients={[ficha, xpo]} />
        );
    }

    it('una ficha de agencia sin prioridad grabada abre en Estándar', () => {
        abrir({ id: 1, name: 'Emilio José Páez', ownerAgencyId: 9 });
        expect(estandar().checked).toBe(true);
        expect(urgente().checked).toBe(false);
    });

    it('una ficha propia sin prioridad grabada sigue abriendo en Urgente', () => {
        abrir({ id: 1, name: 'PROSERVICE' });
        expect(urgente().checked).toBe(true);
    });

    it('la prioridad grabada a mano se respeta al abrir', () => {
        abrir({ id: 1, name: 'Emilio José Páez', ownerAgencyId: 9, priority: 'urgent' });
        expect(urgente().checked).toBe(true);
    });

    it('pasar la ficha a una agencia la pone Estándar, y volver a SUM la pone Urgente', () => {
        abrir({ id: 1, name: 'PROSERVICE' });
        expect(urgente().checked).toBe(true);

        fireEvent.change(baseDeDatos(), { target: { value: '9' } });
        expect(estandar().checked).toBe(true);

        fireEvent.change(baseDeDatos(), { target: { value: '' } });
        expect(urgente().checked).toBe(true);
    });

    it('marcarla como agencia la deja en Urgente: la agencia es cliente de SUM', () => {
        abrir({ id: 1, name: 'TSB', ownerAgencyId: 9 });
        expect(estandar().checked).toBe(true);

        fireEvent.click(screen.getByRole('checkbox', { name: /trae carga de sus propios clientes/i }));
        expect(urgente().checked).toBe(true);
    });

    it('lo que se guarda lleva la prioridad que se ve en pantalla', () => {
        const onSave = vi.fn().mockResolvedValue({ ok: true });
        render(
            <CreateClientModal isOpen onClose={vi.fn()} onSave={onSave}
                initialData={{ id: 1, name: 'Emilio José Páez', ownerAgencyId: 9 }}
                articles={[]} tariffs={[]} allPoblaciones={[]}
                allClients={[{ id: 1, name: 'Emilio José Páez', ownerAgencyId: 9 }, xpo]} />
        );
        fireEvent.click(screen.getByRole('button', { name: /Guardar Ficha/i }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ priority: 'normal', ownerAgencyId: 9 }));
    });
});
