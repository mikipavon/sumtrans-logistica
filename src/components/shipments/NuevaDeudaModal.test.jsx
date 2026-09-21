// ── Apuntar a mano una deuda a un cliente ──
//
// Albaranes en papel del mes pasado que nunca entraron en la app: la oficina
// tiene que poder apuntarle la deuda a un cliente y que le salga al repartidor
// en su pestaña Cobros. Se guarda como un Recibo, la misma pieza que usa el
// cierre mensual de presupuestos, así que lo que se comprueba aquí es que lo
// que se guarda cumple LA regla de cobros (lineasDeCobro) y le cae al repartidor
// elegido.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NuevaDeudaModal from './NuevaDeudaModal';
import { construirRecibo, fechaDeAlbaran, createdAtDeFechaContable } from '../../utils/reciboDeDeuda';
import { lineasDeCobro, cobrosPendientesDe } from '../../utils/pendingCollections';

// Ni Supabase ni el canvas: subir y encoger la foto entran por props. (Un vi.mock
// de esos módulos no vale aquí: los tests comparten entorno sin aislar y otro
// fichero puede haberlos cargado de verdad antes.)
const comprimirFoto = async (file) => 'data:image/jpeg;base64,' + file.name;

const elegirImagen = (nombre) => {
    const input = screen.getByLabelText('Elegir imagen del papel firmado');
    const file = new File(['x'], nombre, { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
};

const clients = [
    { id: 11, name: 'Talleres Pepe', billingType: 'Facturación' },
    { id: 12, name: 'Ferretería Sur', billingType: 'Clientes Habituales' },
];
const drivers = [
    { id: 7, name: 'Juan Ruiz', alias: 'Juanito', isActive: true },
    { id: 8, name: 'Baja Antigua', isActive: false },
];
// Catálogo: BLT_1 es estándar; el palet sólo sale si la ficha lo lista.
const articles = [
    { id: '1774442159060', name: 'BLT_1', price: '7.00', priceB2: '9.50' },
    { id: '1774442159061', name: 'BLT_2', price: '8.00' },
    { id: '9001', name: 'PALET', price: '30.00' },
];

describe('construirRecibo', () => {
    it('la deuda se pide en mano al repartidor elegido aunque el cliente sea de facturación', () => {
        const recibo = construirRecibo({ cliente: clients[0], importe: 42.5, concepto: 'Albaranes de agosto', fecha: '2026-08-31', driverId: '7' });

        expect(recibo.type).toBe('Recibo');
        expect(recibo.client).toBe('Talleres Pepe');
        expect(recibo.clientId).toBe(11);
        expect(recibo.assignedDriverId).toBe(7);
        expect(recibo.customAmount).toBe(42.5);
        expect(recibo.id).toMatch(/^RC-\d{6}$/);

        // La misma regla que usan la oficina y el móvil: una sola línea de porte, de Juan.
        const lineas = lineasDeCobro(recibo, clients);
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toMatchObject({ parte: 'porte', amount: 42.5, responsibleDriverId: 7, payerName: 'Talleres Pepe' });
        expect(cobrosPendientesDe([recibo], 7, clients)).toHaveLength(1);
    });

    it('sin repartidor la deuda queda pendiente pero de nadie, para pasarla luego', () => {
        const recibo = construirRecibo({ cliente: clients[1], importe: '10', concepto: 'Porte sin grabar', fecha: '2026-09-01', driverId: '' });
        expect(recibo.assignedDriverId).toBeNull();
        const lineas = lineasDeCobro(recibo, clients);
        expect(lineas).toHaveLength(1);
        expect(lineas[0].responsibleDriverId).toBeNull();
    });

    it('las fotos del papel firmado van a los dos huecos de foto de entrega que ya enseña la ficha', () => {
        const con = construirRecibo({ cliente: clients[0], importe: 1, concepto: 'x', fecha: '2026-09-01', driverId: '', fotos: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'] });
        expect(con.deliveryPhoto).toBe('https://a/1.jpg');
        expect(con.deliveryPhoto2).toBe('https://a/2.jpg');
        const sin = construirRecibo({ cliente: clients[0], importe: 1, concepto: 'x', fecha: '2026-09-01', driverId: '' });
        expect(sin.deliveryPhoto).toBeNull();
        expect(sin.deliveryPhoto2).toBeNull();
    });

    it('la fecha se guarda como texto en español, igual que en cualquier albarán', () => {
        expect(fechaDeAlbaran('2026-08-31')).toBe(new Date(2026, 7, 31).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }));
    });
});

describe('NuevaDeudaModal', () => {
    const montar = (onCreateShipment = vi.fn().mockResolvedValue(true), onClose = vi.fn(), subirFoto = vi.fn().mockResolvedValue('https://storage/papel.jpg')) => {
        render(
            <NuevaDeudaModal
                isOpen
                onClose={onClose}
                clients={clients}
                drivers={drivers}
                articles={articles}
                onCreateShipment={onCreateShipment}
                subirFoto={subirFoto}
                comprimirFoto={comprimirFoto}
            />
        );
        // Las pruebas de siempre son de recibo.
        fireEvent.click(screen.getByRole('radio', { name: /Recibo al transportista/ }));
        return { onCreateShipment, onClose, subirFoto };
    };

    const elegirCliente = (texto, nombre) => {
        const input = screen.getByPlaceholderText('Escribe para buscar el cliente…');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: texto } });
        fireEvent.mouseDown(screen.getByText(nombre));
    };

    it('no guarda nada sin cliente, sin importe o sin concepto', async () => {
        const { onCreateShipment } = montar();
        fireEvent.click(screen.getByText('Crear recibo'));
        expect(screen.getByRole('alert')).toHaveTextContent('Elige a quién se le cobra');

        elegirCliente('pepe', 'Talleres Pepe');
        fireEvent.click(screen.getByText('Crear recibo'));
        expect(screen.getByRole('alert')).toHaveTextContent('mayor que cero');

        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '30' } });
        fireEvent.click(screen.getByText('Crear recibo'));
        expect(screen.getByRole('alert')).toHaveTextContent('concepto');

        expect(onCreateShipment).not.toHaveBeenCalled();
    });

    it('guarda un Recibo con el cliente, el importe, el concepto y el repartidor, y cierra', async () => {
        const { onCreateShipment, onClose } = montar();

        elegirCliente('pepe', 'Talleres Pepe');
        // Un campo numérico no admite la coma en jsdom (la deja en blanco); en el
        // navegador español la acepta él solo.
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '42.5' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albaranes de agosto' } });
        fireEvent.change(screen.getByLabelText('Quién la cobra'), { target: { value: '7' } });
        fireEvent.click(screen.getByText('Crear recibo'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const recibo = onCreateShipment.mock.calls[0][0];
        expect(recibo).toMatchObject({
            type: 'Recibo',
            client: 'Talleres Pepe',
            clientId: 11,
            customAmount: 42.5,
            amount: '42.50',
            observations: 'Albaranes de agosto',
            assignedDriverId: 7,
            billingType: 'Clientes Habituales',
            portePaid: false,
        });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('los repartidores de baja no salen para elegir', () => {
        montar();
        const select = screen.getByLabelText('Quién la cobra');
        expect(Array.from(select.options).map(o => o.textContent)).not.toContain('Baja Antigua');
    });

    it('la foto se sube antes del alta y el recibo nace con su URL', async () => {
        const { onCreateShipment, subirFoto } = montar();

        elegirCliente('pepe', 'Talleres Pepe');
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '20' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albarán en papel' } });
        elegirImagen('papel.jpg');
        await waitFor(() => expect(screen.getByAltText('Papel firmado 1')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Crear recibo'));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));

        expect(subirFoto).toHaveBeenCalledTimes(1);
        expect(subirFoto.mock.calls[0][0]).toMatch(/^RC-/);
        expect(subirFoto.mock.calls[0][1]).toBe('data:image/jpeg;base64,papel.jpg');
        expect(onCreateShipment.mock.calls[0][0]).toMatchObject({ type: 'Recibo', deliveryPhoto: 'https://storage/papel.jpg', deliveryPhoto2: null });
    });

    it('con más de dos fotos se esconden los botones y una foto se puede quitar', async () => {
        montar();
        elegirImagen('a.jpg');
        await waitFor(() => expect(screen.getByAltText('Papel firmado 1')).toBeInTheDocument());
        elegirImagen('b.jpg');
        await waitFor(() => expect(screen.getByAltText('Papel firmado 2')).toBeInTheDocument());
        expect(screen.queryByText('Hacer foto')).toBeNull();

        fireEvent.click(screen.getByLabelText('Quitar la foto 1'));
        expect(screen.queryByAltText('Papel firmado 2')).toBeNull();
        expect(screen.getByText('Hacer foto')).toBeInTheDocument();
    });

    it('si la foto no sube, avisa y NO crea la deuda', async () => {
        const { onCreateShipment, onClose } = montar(undefined, undefined, vi.fn().mockRejectedValue(new Error('Permiso denegado (RLS)')));

        elegirCliente('pepe', 'Talleres Pepe');
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '20' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albarán en papel' } });
        elegirImagen('papel.jpg');
        await waitFor(() => expect(screen.getByAltText('Papel firmado 1')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Crear recibo'));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se ha podido subir la foto'));
        expect(screen.getByRole('alert')).toHaveTextContent('Permiso denegado');
        expect(onCreateShipment).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('los artículos rellenan el importe con su total y se guardan en el recibo', async () => {
        const { onCreateShipment } = montar();
        elegirCliente('pepe', 'Talleres Pepe');

        // Sin lista propia en la ficha salen los estándar, no el palet.
        const desplegable = screen.getByLabelText('Artículo');
        expect(Array.from(desplegable.options).map(o => o.textContent)).toEqual(['Elige artículo…', 'BLT_1', 'BLT_2']);

        fireEvent.change(desplegable, { target: { value: '1774442159060' } });
        fireEvent.change(screen.getByLabelText('Cant.'), { target: { value: '3' } });
        fireEvent.click(screen.getByText('Añadir'));
        expect(screen.getByText('3x')).toBeInTheDocument();
        expect(screen.getByLabelText('Importe (€)')).toHaveValue(21);

        // Baremo 2: BLT_1 pasa a 9,50 y el importe le sigue.
        fireEvent.change(screen.getByLabelText('Baremo de los artículos'), { target: { value: '2' } });
        expect(screen.getByLabelText('Importe (€)')).toHaveValue(28.5);

        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albaranes de agosto' } });
        fireEvent.click(screen.getByText('Crear recibo'));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const recibo = onCreateShipment.mock.calls[0][0];
        expect(recibo.customAmount).toBe(28.5);
        expect(recibo.articles).toHaveLength(1);
        expect(recibo.articles[0]).toMatchObject({ name: 'BLT_1', quantity: 3, unitPrice: 9.5, totalPrice: 28.5 });
    });

    it('la tarifa especial del cliente manda sobre el precio del artículo, y quitar la línea vacía el desglose', () => {
        render(
            <NuevaDeudaModal
                isOpen
                onClose={vi.fn()}
                clients={[{ id: 21, name: 'Con Tarifa', customRates: { '1774442159060': '5,00' }, allowedArticles: ['9001', '1774442159060'] }]}
                drivers={drivers}
                articles={articles}
                onCreateShipment={vi.fn()}
                comprimirFoto={comprimirFoto}
            />
        );
        elegirCliente('tarifa', 'Con Tarifa');
        const desplegable = screen.getByLabelText('Artículo');
        // En el orden de la ficha.
        expect(Array.from(desplegable.options).map(o => o.textContent)).toEqual(['Elige artículo…', 'PALET', 'BLT_1']);

        fireEvent.change(desplegable, { target: { value: '1774442159060' } });
        fireEvent.click(screen.getByText('Añadir'));
        expect(screen.getByLabelText('Importe (€)')).toHaveValue(5);

        fireEvent.click(screen.getByLabelText('Quitar BLT_1'));
        expect(screen.queryByText('Total artículos')).toBeNull();
    });

    it('un cliente que no tiene ficha se puede escribir a mano y la deuda se guarda con ese nombre', async () => {
        const { onCreateShipment } = montar();
        const input = screen.getByPlaceholderText('Escribe para buscar el cliente…');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Bar Manolo' } });
        // Sin coincidencias, la fila libre es la primera: Enter la coge.
        expect(screen.getByText('Usar «Bar Manolo» (cliente sin ficha)')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText(/Cliente sin ficha/)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '12' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albarán en papel' } });
        fireEvent.click(screen.getByText('Crear recibo'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const recibo = onCreateShipment.mock.calls[0][0];
        expect(recibo).toMatchObject({ type: 'Recibo', client: 'Bar Manolo', clientId: null, customAmount: 12 });
        const lineas = lineasDeCobro(recibo, clients);
        expect(lineas).toHaveLength(1);
        expect(lineas[0].payerName).toBe('Bar Manolo');
    });

    it('lo escrito no se pierde al pinchar en otro campo', () => {
        montar();
        const input = screen.getByPlaceholderText('Escribe para buscar el cliente…');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Bar Manolo' } });
        fireEvent.mouseDown(screen.getByLabelText('Concepto'));
        expect(screen.getByPlaceholderText('Bar Manolo')).toBeInTheDocument();
    });

    it('escribir entero el nombre de un cliente con ficha elige la ficha, no un cliente nuevo', () => {
        montar();
        const input = screen.getByPlaceholderText('Escribe para buscar el cliente…');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'talleres pepe' } });
        expect(screen.queryByText(/Usar «/)).toBeNull();
        fireEvent.mouseDown(screen.getByLabelText('Concepto'));
        expect(screen.getByPlaceholderText('Talleres Pepe')).toBeInTheDocument();
        expect(screen.queryByText(/Cliente sin ficha/)).toBeNull();
    });

    // ── Albarán al cliente ──────────────────────────────────────────────────
    const montarAlbaran = (lista, onCreateShipment = vi.fn().mockResolvedValue(true)) => {
        const pedirNumero = vi.fn(async (serie) => (serie === 'SUM' ? 812 : 455));
        render(
            <NuevaDeudaModal
                isOpen
                onClose={vi.fn()}
                clients={lista}
                drivers={drivers}
                articles={articles}
                onCreateShipment={onCreateShipment}
                comprimirFoto={comprimirFoto}
                pedirNumero={pedirNumero}
            />
        );
        return { onCreateShipment, pedirNumero };
    };
    const rellenarYCrearAlbaran = (fecha = '2026-08-20') => {
        fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: fecha } });
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '55' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Albarán en papel 1234' } });
        fireEvent.click(screen.getByText('Crear albarán'));
    };

    it('por defecto crea un albarán, sin repartidor que elegir', () => {
        montarAlbaran(clients);
        expect(screen.getByRole('radio', { name: /Albarán al cliente/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.queryByLabelText('Quién la cobra')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: /Recibo al transportista/ }));
        expect(screen.getByLabelText('Quién la cobra')).toBeInTheDocument();
        expect(screen.getByText('Crear recibo')).toBeInTheDocument();
    });

    it('Presupuesto: albarán HAB entregado, fechado en su mes, fuera del repartidor y de Cobros Pendientes', async () => {
        const presupuesto = [{ id: 31, name: 'ISPAVICAR', billingType: 'Presupuesto' }];
        const { onCreateShipment, pedirNumero } = montarAlbaran(presupuesto);
        elegirCliente('ispa', 'ISPAVICAR');
        fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-08-20' } });
        expect(screen.getByText(/Cliente de Presupuesto/).closest('p')).toHaveTextContent('cierre de presupuestos');
        expect(screen.getByText(/Cliente de Presupuesto/).closest('p')).toHaveTextContent('agosto de 2026');
        rellenarYCrearAlbaran();

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        expect(pedirNumero).toHaveBeenCalledWith('HAB');
        const albaran = onCreateShipment.mock.calls[0][0];
        expect(albaran).toMatchObject({
            id: 'HAB-455', type: 'Entrega', status: 'Entregado', billingType: 'Presupuesto',
            client: 'ISPAVICAR', assignedDriverId: null, customAmount: 55, fechaContable: '2026-08-20',
        });
        expect(lineasDeCobro(albaran, presupuesto)).toHaveLength(0);
        expect(cobrosPendientesDe([albaran], 7, presupuesto)).toHaveLength(0);
        expect(createdAtDeFechaContable(albaran.fechaContable).slice(0, 7)).toBe('2026-08');
    });

    it('Facturación: albarán de la serie SUM que va a su factura, sin cobro en mano', async () => {
        const { onCreateShipment, pedirNumero } = montarAlbaran(clients);
        elegirCliente('pepe', 'Talleres Pepe');
        expect(screen.getByText(/Cliente de Facturación/).closest('p')).toHaveTextContent('factura');
        rellenarYCrearAlbaran();

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        expect(pedirNumero).toHaveBeenCalledWith('SUM');
        const albaran = onCreateShipment.mock.calls[0][0];
        expect(albaran).toMatchObject({ id: 'SUM-812', billingType: 'Facturación', status: 'Entregado', assignedDriverId: null });
        expect(lineasDeCobro(albaran, clients)).toHaveLength(0);
    });

    it('Clientes Habituales: albarán HAB que queda en Cobros Pendientes sin repartidor', async () => {
        const { onCreateShipment } = montarAlbaran(clients);
        elegirCliente('sur', 'Ferretería Sur');
        expect(screen.getByText(/Cliente de Clientes Habituales/).closest('p')).toHaveTextContent('Cobros Pendientes sin repartidor');
        rellenarYCrearAlbaran();

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const albaran = onCreateShipment.mock.calls[0][0];
        expect(albaran).toMatchObject({ id: 'HAB-455', billingType: 'Clientes Habituales' });
        const lineas = lineasDeCobro(albaran, clients);
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toMatchObject({ amount: 55, responsibleDriverId: null });
        expect(cobrosPendientesDe([albaran], 7, clients)).toHaveLength(0);
    });

    it('sin número del servidor el albarán se crea igual, con número provisional de su serie', async () => {
        const onCreateShipment = vi.fn().mockResolvedValue(true);
        render(
            <NuevaDeudaModal
                isOpen onClose={vi.fn()} clients={clients} drivers={drivers} articles={articles}
                onCreateShipment={onCreateShipment} comprimirFoto={comprimirFoto}
                pedirNumero={vi.fn().mockRejectedValue(new Error('sin red'))}
            />
        );
        elegirCliente('pepe', 'Talleres Pepe');
        rellenarYCrearAlbaran();
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        expect(onCreateShipment.mock.calls[0][0].id).toMatch(/^SUM-\d{6}$/);
    });

    it('un albarán no se crea sin la fecha del papel; un recibo sin fecha es de hoy', async () => {
        const { onCreateShipment } = montarAlbaran(clients);
        elegirCliente('pepe', 'Talleres Pepe');
        expect(screen.getByText(/Pon la fecha del papel/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '9' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Papel' } });
        fireEvent.click(screen.getByText('Crear albarán'));
        expect(screen.getByRole('alert')).toHaveTextContent('fecha del albarán en papel');
        expect(onCreateShipment).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('radio', { name: /Recibo al transportista/ }));
        fireEvent.click(screen.getByText('Crear recibo'));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        expect(onCreateShipment.mock.calls[0][0].date).toBe(fechaDeAlbaran(new Date().toISOString().slice(0, 10)));
    });

    it('Recibo elegido a propósito para un cliente de Presupuesto: va al transportista', async () => {
        const presupuesto = [{ id: 31, name: 'ISPAVICAR', billingType: 'Presupuesto' }];
        const { onCreateShipment } = montarAlbaran(presupuesto);
        fireEvent.click(screen.getByRole('radio', { name: /Recibo al transportista/ }));
        elegirCliente('ispa', 'ISPAVICAR');
        expect(screen.queryByText(/Cliente de Presupuesto/)).toBeNull();
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '40' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Cobro pendiente' } });
        fireEvent.change(screen.getByLabelText('Quién la cobra'), { target: { value: '7' } });
        fireEvent.click(screen.getByText('Crear recibo'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const recibo = onCreateShipment.mock.calls[0][0];
        expect(recibo).toMatchObject({ type: 'Recibo', assignedDriverId: 7, customAmount: 40 });
        expect(cobrosPendientesDe([recibo], 7, presupuesto)).toHaveLength(1);
    });

    it('si el alta falla avisa y no cierra', async () => {
        const { onClose } = montar(vi.fn().mockResolvedValue(false));
        elegirCliente('sur', 'Ferretería Sur');
        fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '5' } });
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Porte' } });
        fireEvent.click(screen.getByText('Crear recibo'));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se ha podido guardar'));
        expect(onClose).not.toHaveBeenCalled();
    });
});
