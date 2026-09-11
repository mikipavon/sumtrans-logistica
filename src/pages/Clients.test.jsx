// ── La ficha que se quedó sin Nº Cliente ──
//
// La casilla del formulario pone "Auto", pero "Auto" sólo corría al dar de alta:
// las fichas viejas y las que vuelven de una copia de seguridad salían en el
// listado con "--" y guardar no les ponía número. Ahora el guardado desde
// Clientes se lo pide a App (ver handleUpdateClient y utils/numeracionCliente),
// y lo que se comprueba aquí es justo ese encargo: sin él, la asignación no
// llega a correr nunca y el listado sigue enseñando "--".

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Clients from './Clients';

// El modal de ficha arrastra medio proyecto. Aquí sólo hace falta que devuelva
// lo que devolvería al guardar una ficha que ya existía.
const fichaGuardada = { id: 7, name: 'SUMINISTROS SECILLA', clientNumber: '', billingType: 'Clientes Habituales' };
vi.mock('../components/clients/CreateClientModal', () => ({
    default: ({ onSave }) => (
        <button onClick={() => onSave(fichaGuardada)}>guardar-ficha</button>
    ),
}));
vi.mock('../components/clients/AgencyDatabasesPanel', () => ({ default: () => null }));

const pintarClientes = (props = {}) => render(
    <Clients
        clients={[]}
        allClients={[]}
        shipments={[]}
        allPoblaciones={[]}
        articles={[]}
        tariffs={[]}
        onUpdateClient={vi.fn()}
        onAddClient={vi.fn()}
        onImportClients={vi.fn()}
        onDeleteClient={vi.fn()}
        onAssignOwnerAgency={vi.fn()}
        onDeleteAgencyDatabase={vi.fn()}
        onImpersonateClient={vi.fn()}
        {...props}
    />
);

describe('Clients — guardar una ficha que ya existía', () => {
    it('pide que le pongan número si no tiene', async () => {
        const onUpdateClient = vi.fn().mockResolvedValue({});
        pintarClientes({ onUpdateClient });

        fireEvent.click(screen.getByText('guardar-ficha'));

        expect(onUpdateClient).toHaveBeenCalledWith(
            7,
            fichaGuardada,
            null,
            { asignarNumeroSiFalta: true },
        );
    });
});

describe('Clients — el listado', () => {
    it('enseña "--" en el Nº de la ficha que no lo tiene', () => {
        const sinNumero = { id: 7, name: 'SUMINISTROS SECILLA', type: 'Destinatario', billingType: 'Clientes Habituales', status: 'approved' };
        pintarClientes({ clients: [sinNumero], allClients: [sinNumero] });

        // La primera celda es la del Nº. El "--" no se busca suelto: sin
        // teléfono, la columna de Contacto enseña otro igual.
        const fila = screen.getByText('SUMINISTROS SECILLA').closest('tr');
        expect(fila.querySelector('td').textContent.trim()).toBe('--');
    });

    it('enseña el número a cuatro cifras cuando lo tiene', () => {
        const conNumero = { id: 8, name: 'FERRETERÍA EL TORNILLO', clientNumber: 'CH-3', type: 'Destinatario', billingType: 'Clientes Habituales', status: 'approved' };
        pintarClientes({ clients: [conNumero], allClients: [conNumero] });

        expect(screen.getByText('CH-0003')).toBeTruthy();
    });

});

// ── El repaso de las que no tienen número ──
//
// Arreglarlas de una en una es el camino largo cuando son decenas. El botón
// enseña primero qué número le tocaría a cada una y sólo escribe si se le dice
// que sí: el nº de cliente es con el que la ficha sale en Factusol.
describe('Clients — repasar las fichas sin Nº', () => {
    const sinNumero = (id, name) => ({ id, name, type: 'Destinatario', billingType: 'Clientes Habituales', status: 'approved' });
    const conNumero = { id: 1, name: 'FERRETERÍA EL TORNILLO', clientNumber: 'CH-1', type: 'Destinatario', billingType: 'Clientes Habituales', status: 'approved' };

    it('no ofrece el botón si no le falta a ninguna', () => {
        pintarClientes({ clients: [conNumero], allClients: [conNumero] });
        expect(screen.queryByTitle(/repasarlas y ponerles número/i)).toBeNull();
    });

    it('cuenta las que están sin número, pendientes aparte', () => {
        // Las pendientes cogen número al aprobarlas en Validar Clientes, así que
        // no entran en el repaso (además, el listado ni las enseña).
        const pendiente = { ...sinNumero(9, 'LA QUE ESPERA'), status: 'pending' };
        const cartera = [conNumero, sinNumero(7, 'SUMINISTROS SECILLA'), pendiente];
        pintarClientes({ clients: cartera, allClients: cartera });

        expect(screen.getByText('Sin Nº (1)')).toBeTruthy();
    });

    it('enseña el número que le tocaría a cada una antes de escribir nada', () => {
        const onUpdateClient = vi.fn().mockResolvedValue({});
        const cartera = [conNumero, sinNumero(7, 'SUMINISTROS SECILLA'), sinNumero(8, 'ALMACENES ÁLVAREZ')];
        pintarClientes({ clients: cartera, allClients: cartera, onUpdateClient });

        fireEvent.click(screen.getByText('Sin Nº (2)'));

        // Por orden alfabético y sin pisar el CH-1 que ya está cogido.
        expect(screen.getByText('CH-2')).toBeTruthy();
        expect(screen.getByText('CH-3')).toBeTruthy();
        expect(onUpdateClient).not.toHaveBeenCalled();
    });

    it('al confirmar, a cada ficha le manda sólo su número', async () => {
        const onUpdateClient = vi.fn().mockResolvedValue({});
        const cartera = [conNumero, sinNumero(7, 'SUMINISTROS SECILLA'), sinNumero(8, 'ALMACENES ÁLVAREZ')];
        pintarClientes({ clients: cartera, allClients: cartera, onUpdateClient });

        fireEvent.click(screen.getByText('Sin Nº (2)'));
        fireEvent.click(screen.getByText('Poner los 2 números'));

        await waitFor(() => expect(onUpdateClient).toHaveBeenCalledTimes(2));
        // ALMACENES ÁLVAREZ va primero: la Á se ordena con la A.
        expect(onUpdateClient).toHaveBeenNthCalledWith(1, 8, { clientNumber: 'CH-2' });
        expect(onUpdateClient).toHaveBeenNthCalledWith(2, 7, { clientNumber: 'CH-3' });
    });

    it('cancelar no toca nada', () => {
        const onUpdateClient = vi.fn().mockResolvedValue({});
        const cartera = [sinNumero(7, 'SUMINISTROS SECILLA')];
        pintarClientes({ clients: cartera, allClients: cartera, onUpdateClient });

        fireEvent.click(screen.getByText('Sin Nº (1)'));
        fireEvent.click(screen.getByText('Cancelar'));

        expect(onUpdateClient).not.toHaveBeenCalled();
        expect(screen.queryByText('Poner el número')).toBeNull();
    });

    it('con el candado echado avisa de las que no se ven', () => {
        // Modo Fantasma: la oficina no ve las de Clientes Habituales. El repaso
        // no puede tocarlas, pero tampoco hace como si no existieran.
        const aLaVista = { id: 5, name: 'TRANSPORTES DEL SUR', type: 'Remitente', billingType: 'Facturación', status: 'approved' };
        const escondida = sinNumero(7, 'SUMINISTROS SECILLA');
        pintarClientes({ clients: [aLaVista], allClients: [aLaVista, escondida], isGhostModeUnlocked: false });

        fireEvent.click(screen.getByText('Sin Nº (1)'));

        expect(screen.getByText(/hay 1 ficha más sin número/i)).toBeTruthy();
        expect(screen.queryByText('SUMINISTROS SECILLA')).toBeNull();
    });
});
