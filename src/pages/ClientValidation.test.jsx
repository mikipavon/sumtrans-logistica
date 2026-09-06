// ── Que un registro de la web se distinga de lo que crea la app sola ──
//
// En "Validar Clientes" caen mezcladas dos cosas: las fichas que nacen al hacer
// un albarán o una entrega (decenas, no las ha pedido nadie) y las empresas que
// se registran en el formulario de la web (las que están esperando respuesta).
// Se veían exactamente igual, y la tarjeta no enseñaba correo, CIF ni persona
// de contacto, así que no había forma de saber QUIÉN se había registrado.

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Estas pruebas miran la tarjeta entera. La lista compacta (la vista por
// defecto) tiene las suyas al final.
beforeEach(() => localStorage.setItem('validacion-vista', 'tarjetas'));

const props = {
    onValidateClient: vi.fn(),
    onUpdateClient: vi.fn(),
    onDeleteClients: vi.fn(),
    articles: [],
    tariffs: [],
    allPoblaciones: [],
};

describe('Validar Clientes — quién se ha registrado por la web', () => {
    it('al entrar enseña sólo las fichas de albarán, no los registros de la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
        expect(screen.queryByText('PANADERÍA LA ESPIGA')).not.toBeInTheDocument();
    });

    it('en «Registrados en la web» salen los de la web y no las fichas de albarán', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText('FERRETERÍA EL TORNILLO')).not.toBeInTheDocument();
    });

    it('la tarjeta del registro web identifica a quien se ha dado de alta', () => {
        render(<ClientValidation clients={[registroWeb]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

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

    it('si al entrar no hay fichas de albarán, avisa de los que esperan en la web', () => {
        render(<ClientValidation clients={[registroWeb]} {...props} />);

        // Se entra por «Creados al hacer albaranes» y ahí no hay nada: sin este
        // aviso la pantalla parecería vacía teniendo a alguien esperando.
        expect(screen.getByText(/En «Registrados en la web» esperan 1/)).toBeInTheDocument();
    });

    it('la ficha creada en un albarán no finge ser un registro de la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran]} {...props} />);

        // El filtro arranca en «Creados al hacer albaranes», así que ya se ve.
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
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

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

// ── La misma empresa, dos y tres veces en la lista ──
//
// Cada camino de alta creaba su propia ficha sin saber de las demás, así que en
// esta pantalla salían varias tarjetas del mismo cliente y ninguna entera: una
// con coordenadas y sin teléfono, otra al revés. No había ningún aviso, y
// aprobar a ojo significaba tirar lo que trajera la otra.
describe('Validar Clientes — solicitudes repetidas del mismo cliente', () => {
    const sinGps = {
        id: 10,
        name: 'BasicRoca',
        status: 'pending',
        type: 'Remitente',
        createdFrom: 'Albarán Automático',
        createdBy: 'Conductor',
        city: 'Cordoba',
        lastInteraction: '2026-08-20',
    };
    const conGps = {
        id: 11,
        name: 'BasicRoca',
        status: 'pending',
        type: 'Remitente',
        createdFrom: 'Albarán',
        createdBy: 'Cond.FRANCISCO JAVIER PAVON MAIZ',
        city: 'Cordoba',
        address: ', 14000 Cordoba',
        coordinates: '37.547904, -4.663849',
        lastInteraction: '2026-08-20',
    };
    const sola = { id: 12, name: 'Zuricar', status: 'pending', type: 'Destinatario', city: 'Espejo' };

    const renderLista = (extra = {}) =>
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} {...extra} />);

    it('avisa en la tarjeta de cuántas solicitudes hay de ese cliente', () => {
        renderLista();
        const avisos = screen.getAllByText('Repetida: 2 solicitudes de este mismo cliente');
        // Una en cada una de las dos tarjetas de BasicRoca.
        expect(avisos).toHaveLength(2);
    });

    it('dice qué se gana al unirlas, para saber con cuál quedarse', () => {
        renderLista();
        // La que no tiene GPS gana el GPS de la otra; la que sí lo tiene no gana nada.
        expect(screen.getByText(/ésta se queda la dirección y las coordenadas/)).toBeInTheDocument();
        expect(screen.getByText('Las otras no aportan ningún dato que a ésta le falte.')).toBeInTheDocument();
    });

    it('no marca como repetida a la que no tiene pareja', () => {
        renderLista();
        const zuricar = screen.getByText('Zuricar').closest('div.bg-white');
        expect(within(zuricar).queryByText(/Repetida:/)).not.toBeInTheDocument();
    });

    it('al unir, copia los huecos en la que se queda y borra la otra', async () => {
        const onUpdateClient = vi.fn().mockResolvedValue();
        const onDeleteClients = vi.fn().mockResolvedValue();
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderLista({ onUpdateClient, onDeleteClients });

        // La tarjeta sin GPS: es la única que tiene algo que ganar al unir.
        const tarjetaSinGps = screen
            .getByText(/ésta se queda la dirección y las coordenadas/)
            .closest('div.bg-white');
        const boton = within(tarjetaSinGps).getByRole('button', { name: /unir las demás/i });
        fireEvent.click(boton);
        await screen.findByText('Zuricar');

        expect(onUpdateClient).toHaveBeenCalledWith(10, {
            address: ', 14000 Cordoba',
            coordinates: '37.547904, -4.663849',
        });
        expect(onDeleteClients).toHaveBeenCalledWith([11]);
        window.confirm.mockRestore();
    });

    it('el encabezado dice cuántos clientes están repetidos, no cuántas tarjetas sobran', () => {
        renderLista();
        const contador = screen.getByText('repetidos en la lista').closest('div');
        expect(within(contador).getByText('1')).toBeInTheDocument();
    });
});

// ── La lista compacta ──
//
// Con decenas de fichas de albarán la pantalla de tarjetas era un muro de
// recuadros. La lista enseña una fila por cliente con TODO lo de la tarjeta
// (conductor, ubicación, de quién es, avisos) sin tener que desplegar nada.
describe('Validar Clientes — vista de lista', () => {
    beforeEach(() => localStorage.setItem('validacion-vista', 'lista'));

    const sinGps = { id: 10, name: 'BasicRoca', status: 'pending', type: 'Remitente', createdFrom: 'Albarán', city: 'Cordoba', lastInteraction: '2026-08-20' };
    const conGps = { id: 11, name: 'BasicRoca', status: 'pending', type: 'Remitente', createdFrom: 'Albarán', createdBy: 'Cond. MANUEL', city: 'Cordoba', coordinates: '37.5, -4.6', lastInteraction: '2026-08-20' };
    const sola = { id: 12, name: 'Zuricar', status: 'pending', type: 'Destinatario', city: 'Espejo' };

    it('sin nada guardado sale la lista, con una fila por ficha', () => {
        localStorage.removeItem('validacion-vista');
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} />);
        expect(screen.getByText('Zuricar')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Aprobar' })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: 'Editar y Validar' })).toHaveLength(3);
    });

    it('la fila enseña conductor, ubicación, de quién es y los avisos, como la tarjeta', () => {
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} />);
        expect(screen.getByText('Por: Cond. MANUEL')).toBeInTheDocument();
        expect(screen.getByText('37.5, -4.6').closest('a')).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
        expect(screen.getAllByText('Mis clientes')).toHaveLength(3);
        expect(screen.getAllByText('Repetida: 2 solicitudes de este mismo cliente')).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: /unir las demás/i })).toHaveLength(2);
    });

    it('los botones de la fila aprueban y rechazan igual que en la tarjeta', () => {
        const onValidateClient = vi.fn().mockResolvedValue();
        render(<ClientValidation clients={[sola]} {...props} onValidateClient={onValidateClient} />);
        fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
        expect(onValidateClient).toHaveBeenCalledWith(12, false);
    });

    it('el conmutador cambia a tarjetas y lo deja guardado', () => {
        render(<ClientValidation clients={[sola]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Tarjetas/ }));
        expect(screen.getByRole('button', { name: /Editar y Validar/ })).toHaveTextContent('Editar y Validar');
        expect(localStorage.getItem('validacion-vista')).toBe('tarjetas');
    });
});
