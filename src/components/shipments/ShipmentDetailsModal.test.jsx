// ── Editar un albarán no puede cambiarle el precio por su cuenta ──
//
// SUM-258, 2 de septiembre de 2026: albarán a Casariche (Baremo 2) dado de alta
// con BLT_5 a 21,50 €. Al pulsar Editar, la ficha volvía a poner el artículo a
// 18,00 € (su precio de Baremo 1, porque la ficha no conocía los baremos) y
// "Guardar Cambios" pisaba el importe bueno aunque no se hubiera tocado nada.
// Ahora la ficha usa la misma cuenta que el alta, y sólo recalcula si durante la
// edición cambia algo que afecte al precio: quién paga o el pueblo.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';

// La ficha arrastra impresión, PDF y Supabase; aquí sólo se mira el precio.
vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const BLT_5 = { id: 'blt5', name: 'BLT_5', price: '18.00', priceB2: '21.50' };

const sum258 = {
    id: 'SUM-258',
    client: 'COMERCIAL BADI S.A.',
    destinationName: 'Suministros Secilla',
    porteType: 'Pagado',
    status: 'En reparto',
    date: '2 sept 2026',
    originCity: 'Córdoba',
    originZip: '14005',
    destinationCity: 'Casariche',
    destinationZip: '41580',
    amount: '€21.50',
    customAmount: 21.5,
    codAmount: 0,
    hasCod: false,
    codCommission: 0,
    packages: '1x BLT_5',
    articles: [{ ...BLT_5, quantity: 1, unitPrice: 21.5, totalPrice: 21.5, uniqueId: 'a1' }],
};

const abrirEnEdicion = () => {
    render(
        <ShipmentDetailsModal
            isOpen={true}
            onClose={() => {}}
            shipment={sum258}
            onUpdate={vi.fn()}
            allPoblaciones={[]}
            clients={[]}
            articles={[BLT_5]}
            tariffs={null}
            coverageZones={[]}
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
};

describe('ShipmentDetailsModal: el precio al editar', () => {
    it('pulsar Editar deja el precio guardado tal cual', () => {
        abrirEnEdicion();
        expect(screen.getByDisplayValue('€21.50')).toBeInTheDocument();
        expect(screen.getByText('21.50€')).toBeInTheDocument();
    });

    it('cambiar el destino a un pueblo de Baremo 1 baja al precio base, y volver a Baremo 2 lo devuelve', () => {
        abrirEnEdicion();
        fireEvent.change(screen.getByDisplayValue('41580'), { target: { value: '14940' } });
        fireEvent.change(screen.getByDisplayValue('Casariche'), { target: { value: 'Cabra' } });
        expect(screen.getByDisplayValue('18.00')).toBeInTheDocument();
        expect(screen.getByText('18.00€')).toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('14940'), { target: { value: '41580' } });
        fireEvent.change(screen.getByDisplayValue('Cabra'), { target: { value: 'Casariche' } });
        expect(screen.getByDisplayValue('21.50')).toBeInTheDocument();
    });
});

// ── La población se busca, no se teclea entera ──
//
// REC-689, 28/09/2026: al modificar una recogida, tecleando "benam" en la
// población de destino no salía ninguna sugerencia. El buscador sólo estaba en
// las altas; en la ficha la población era una caja de texto y el C.P. había
// que sabérselo.
describe('ShipmentDetailsModal: la población al editar', () => {
    const rec689 = {
        ...sum258,
        id: 'REC-689',
        type: 'Recogida',
        originCity: 'Moriles',
        originZip: '14510',
        destinationName: 'ANTONIO NUÑEZ',
        destinationCity: '',
        destinationZip: '',
        articles: [],
        packages: '',
    };

    const abrir = (shipment, extra = {}) => {
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={shipment} onUpdate={vi.fn()}
                clients={[]} articles={[BLT_5]} tariffs={null} coverageZones={[]}
                {...extra}
            />
        );
        fireEvent.click(screen.getByTitle('Editar'));
    };

    it('tecleando "benam" ofrece Benamejí, y al elegirlo pone su C.P.', () => {
        // Sin allPoblaciones, como la abren Notificaciones o Cobros Pendientes.
        abrir(rec689);
        const poblaciones = screen.getAllByPlaceholderText('Población');
        fireEvent.change(poblaciones[1], { target: { value: 'benam' } });

        fireEvent.click(screen.getByText('Benamejí'));
        expect(poblaciones[1].value).toBe('Benamejí');
        expect(screen.getByDisplayValue('14910')).toBeInTheDocument();
        // El origen no se ha movido.
        expect(poblaciones[0].value).toBe('Moriles');
        expect(screen.getByDisplayValue('14510')).toBeInTheDocument();
    });

    it('no pisa un C.P. que ya es de ese pueblo', () => {
        abrir(sum258);
        const origen = screen.getAllByPlaceholderText('Población')[0];
        fireEvent.change(origen, { target: { value: 'Cordoba' } });
        expect(screen.getByDisplayValue('14005')).toBeInTheDocument();
    });

    it('un pueblo que no está en las listas se puede escribir y deja el C.P. como estaba', () => {
        abrir(sum258);
        const destino = screen.getAllByPlaceholderText('Población')[1];
        fireEvent.change(destino, { target: { value: 'Villanueva del Trabuco' } });
        expect(destino.value).toBe('Villanueva del Trabuco');
        expect(screen.getByDisplayValue('41580')).toBeInTheDocument();
    });
});

// ── Marcar la documentación firmada al modificar el albarán ──
//
// El albarán de agencia se daba de alta sin marcar "Firma Doc." y no había forma
// de añadirlo después: la casilla sólo estaba en el alta. Sin ese campo el
// repartidor no ve el aviso del papel firmado ni se le exige la foto del
// documento. Ahora se puede marcar desde la ficha, al editar.
describe('ShipmentDetailsModal: la documentación firmada', () => {
    it('no se anuncia en un albarán que no la pide', () => {
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={sum258} onUpdate={vi.fn()}
                allPoblaciones={[]} clients={[]} articles={[BLT_5]} tariffs={null} coverageZones={[]}
            />
        );
        expect(screen.queryByText(/Devolver Documentación Firmada/)).not.toBeInTheDocument();
    });

    it('se puede marcar al editar y se guarda en el albarán', async () => {
        const onUpdate = vi.fn();
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={sum258} onUpdate={onUpdate}
                allPoblaciones={[]} clients={[]} articles={[BLT_5]} tariffs={null} coverageZones={[]}
            />
        );
        fireEvent.click(screen.getByTitle('Editar'));

        const casilla = screen.getByRole('checkbox', { name: /Devolver Documentación Firmada/ });
        expect(casilla.checked).toBe(false);
        fireEvent.click(casilla);

        fireEvent.click(screen.getByText('Guardar Cambios'));
        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
        expect(onUpdate.mock.calls[0][1].needsSignatureReturn).toBe(true);
    });

    it('el albarán que ya la pide lo enseña sin entrar a editar', () => {
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={{ ...sum258, needsSignatureReturn: true }} onUpdate={vi.fn()}
                allPoblaciones={[]} clients={[]} articles={[BLT_5]} tariffs={null} coverageZones={[]}
            />
        );
        expect(screen.getByText(/Devolver Documentación Firmada/)).toBeInTheDocument();
    });
});

// ── El portal del cliente enseña qué lleva el envío sin tener que editar ──
//
// SUM-2067, 22/09/2026: en el detalle del portal no salían los bultos ni los
// artículos, porque el bloque de importes va escondido para el cliente. Los
// artículos se enseñan en lectura y sin precios (los importes son de quien paga).
describe('ShipmentDetailsModal: bultos y artículos en el portal del cliente', () => {
    const abrirEnElPortal = (extra = {}) => render(
        <ShipmentDetailsModal
            isOpen={true}
            onClose={() => {}}
            shipment={{ ...sum258, ...extra }}
            isReadOnly={true}
            isClientView={true}
            clientePortal={{ id: 1, name: 'COMERCIAL BADI S.A.' }}
            allPoblaciones={[]}
            clients={[]}
            articles={[BLT_5]}
            tariffs={null}
            coverageZones={[]}
        />
    );

    it('enseña los artículos sin precio', () => {
        abrirEnElPortal({ articles: [{ ...BLT_5, quantity: 2, unitPrice: 21.5, totalPrice: 43, uniqueId: 'a1' }] });
        expect(screen.getByText('Bultos y Artículos')).toBeInTheDocument();
        expect(screen.getByText('2x BLT_5')).toBeInTheDocument();
        expect(screen.queryByText('43.00€')).not.toBeInTheDocument();
        expect(screen.queryByText('Precio Final Porte')).not.toBeInTheDocument();
    });

    it('sin artículos enseña el texto de bultos, y los kilos si los hay', () => {
        abrirEnElPortal({ articles: [], packages: '3', weightKg: 12 });
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('⚖️ 12 kg')).toBeInTheDocument();
    });
});

// ── Dar por escaneados los bultos que faltan ──
//
// SUM-2442, 28/09/2026: el repartidor llevaba los 7 bultos y sólo pasó 6 por el
// escáner. Al entregar, el móvil lo mandaba a incidencia por entrega parcial y
// nadie tenía dónde corregir el contador. Va en la ficha, al editar.
describe('ShipmentDetailsModal: completar los bultos escaneados', () => {
    const BLT_7 = { id: 'blt7', name: 'BLT_7', price: '40.00', priceB2: '40.00' };
    const sum2442 = {
        ...sum258,
        id: 'SUM-2442',
        client: 'DISFER',
        amount: '€40.00',
        customAmount: 40,
        packages: '1x BLT_7',
        articles: [{ ...BLT_7, quantity: 1, unitPrice: 40, totalPrice: 40, uniqueId: 'a1' }],
        scannedPackages: [1, 2, 3, 4, 5, 6],
        pickedUpBy: 'Cond. JUAN CARLOS',
    };
    const abrir = (extra = {}, onUpdate = vi.fn()) => {
        render(
            <ShipmentDetailsModal
                showAdminControls
                isOpen={true} onClose={() => {}} shipment={{ ...sum2442, ...extra }} onUpdate={onUpdate}
                allPoblaciones={[]} clients={[]} articles={[BLT_7]} tariffs={null} coverageZones={[]}
            />
        );
        fireEvent.click(screen.getByTitle('Editar'));
        return onUpdate;
    };
    const casilla = () => screen.queryByRole('checkbox', { name: /bultos por escaneados/ });

    it('marcada y guardada, quedan los 7 y la ficha pasa a 7/7', async () => {
        const onUpdate = abrir();
        expect(screen.getByText('6/7 BULTOS ESCANEADOS')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', { name: /Dar los 7 bultos por escaneados/ }));
        fireEvent.click(screen.getByText('Guardar Cambios'));
        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());

        const guardado = onUpdate.mock.calls[0][1];
        expect(guardado.scannedPackages).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(guardado.scannedCompletedBy).toBe('Administrador');
        expect(guardado.scannedCompletedAt).toBeTruthy();
        // Ni el estado ni quién lo recogió cambian.
        expect(guardado.status).toBe('En reparto');
        expect(guardado.pickedUpBy).toBe('Cond. JUAN CARLOS');
        expect(await screen.findByText('7/7 BULTOS ESCANEADOS')).toBeInTheDocument();
    });

    it('sin marcarla, guardar la ficha deja los 6 como estaban', async () => {
        const onUpdate = abrir();
        fireEvent.click(screen.getByText('Guardar Cambios'));
        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());

        const guardado = onUpdate.mock.calls[0][1];
        expect(guardado.scannedPackages).toEqual([1, 2, 3, 4, 5, 6]);
        expect(guardado.scannedCompletedAt).toBeUndefined();
    });

    it('marcarla y cancelar no guarda nada ni la deja marcada', () => {
        const onUpdate = abrir();
        fireEvent.click(casilla());
        fireEvent.click(screen.getByText('Cancelar'));
        expect(onUpdate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTitle('Editar'));
        expect(casilla().checked).toBe(false);
    });

    it('no sale con todos escaneados', () => {
        abrir({ scannedPackages: [1, 2, 3, 4, 5, 6, 7] });
        expect(casilla()).toBeNull();
    });

    it('no sale si no se ha escaneado ninguno', () => {
        abrir({ scannedPackages: [] });
        expect(casilla()).toBeNull();
    });

    it('no sale en un entregado: lo que se entregó a medias se queda como fue', () => {
        abrir({ status: 'Entregado' });
        expect(casilla()).toBeNull();
    });
});
