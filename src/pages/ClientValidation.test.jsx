// ── Que un registro de la web se distinga de lo que crea la app sola ──
//
// En "Validar Clientes" caen mezcladas dos cosas: las fichas que nacen al hacer
// un albarán o una entrega (decenas, no las ha pedido nadie) y las empresas que
// se registran en el formulario de la web (las que están esperando respuesta).
// Se veían exactamente igual, y la tarjeta no enseñaba correo, CIF ni persona
// de contacto, así que no había forma de saber QUIÉN se había registrado.

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClientValidation from './ClientValidation';

// El modal de alta arrastra medio proyecto y aquí no se abre nunca.
vi.mock('../components/clients/CreateClientModal', () => ({
    default: () => null,
}));

const registroWeb = {
    id: 1,
    name: 'PANADERÍA LA ESPIGA',
    legalName: 'LA ESPIGA SL',
    status: 'pending',
    type: 'Remitente',
    createdFrom: 'web-registro',
    createdAt: '2026-08-17T09:30:00.000Z',
    email: 'pedidos@laespiga.com',
    cif: 'B14567890',
    contactPerson: 'Ana Ruiz',
    city: 'Cabra',
    phone: '957000111',
};

const creadoEnAlbaran = {
    id: 2,
    name: 'FERRETERÍA EL TORNILLO',
    status: 'pending',
    type: 'Destinatario',
    createdFrom: 'Albarán',
    lastInteraction: '2026-08-16',
    city: 'Lucena',
};

const props = {
    onValidateClient: vi.fn(),
    onUpdateClient: vi.fn(),
    onDeleteClients: vi.fn(),
    articles: [],
    tariffs: [],
    allPoblaciones: [],
};

describe('Validar Clientes — quién se ha registrado por la web', () => {
    it('al entrar enseña sólo los registros de la web, no las fichas de albarán', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText('FERRETERÍA EL TORNILLO')).not.toBeInTheDocument();
    });

    it('la tarjeta del registro web identifica a quien se ha dado de alta', () => {
        render(<ClientValidation clients={[registroWeb]} {...props} />);

        expect(screen.getByText('Se ha registrado en la web')).toBeInTheDocument();
        // Lo que hace falta para reconocer la empresa y llamarla.
        expect(screen.getByText('pedidos@laespiga.com')).toBeInTheDocument();
        expect(screen.getByText('B14567890')).toBeInTheDocument();
        expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
        expect(screen.getByText('LA ESPIGA SL')).toBeInTheDocument();
        // Y cuándo lo hizo, con la hora: `createdAt` en vez del día suelto.
        expect(screen.getByText(/17\/08\/2026/)).toBeInTheDocument();
    });

    it('con «Todos» vuelven a salir también las fichas creadas al hacer albaranes', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
    });

    it('la ficha creada en un albarán no finge ser un registro de la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran]} {...props} />);

        // Sin registros web el filtro arranca en «Todos», así que ya se ve.
        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
        expect(screen.queryByText('Se ha registrado en la web')).not.toBeInTheDocument();

        // Y el filtro de web avisa de que no hay nadie, en vez de decir que
        // ningún cliente coincide con una búsqueda que no se ha escrito.
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));
        expect(screen.getByText(/Nadie se ha registrado por la web/)).toBeInTheDocument();
    });

    it('el buscador encuentra por correo y por CIF, no sólo por nombre', () => {
        const otroWeb = { ...registroWeb, id: 3, name: 'BODEGAS MONTILLA', email: 'admin@bodegas.com', cif: 'B99999999', contactPerson: '', legalName: '' };
        render(<ClientValidation clients={[registroWeb, otroWeb]} {...props} />);

        const buscador = screen.getByPlaceholderText(/Buscar por nombre/);
        fireEvent.change(buscador, { target: { value: 'pedidos@laespiga' } });
        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText('BODEGAS MONTILLA')).not.toBeInTheDocument();

        fireEvent.change(buscador, { target: { value: 'B99999999' } });
        expect(screen.getByText('BODEGAS MONTILLA')).toBeInTheDocument();
        expect(screen.queryByText('PANADERÍA LA ESPIGA')).not.toBeInTheDocument();
    });

    it('los registros web salen antes que las fichas de albarán, y el último arriba', () => {
        const webAntiguo = { ...registroWeb, id: 4, name: 'WEB VIEJA', createdAt: '2026-08-10T08:00:00.000Z' };
        render(<ClientValidation clients={[creadoEnAlbaran, webAntiguo, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

        const nombres = screen.getAllByTitle(/PANADERÍA LA ESPIGA|WEB VIEJA|FERRETERÍA EL TORNILLO/)
            .map(el => el.textContent);
        expect(nombres).toEqual(['PANADERÍA LA ESPIGA', 'WEB VIEJA', 'FERRETERÍA EL TORNILLO']);
    });

    it('el contador del encabezado dice cuántos se han registrado por la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        const chip = screen.getByText('registrados en la web').closest('div');
        expect(within(chip).getByText('1')).toBeInTheDocument();
    });
});
