// ── Un cobro marcado a mano por la oficina tiene que salir en la Cuenta ──
//
// SUM-1204, 15 de septiembre de 2026: albarán de dos bultos con una sola
// etiqueta. Antonio entregó los dos y cobró los 12 €, pero la app lo mandó a
// incidencia por entrega parcial. La oficina lo cerró a mano desde la ficha:
// Entregado, conductor Antonio y el check "Porte Cobrado". El check no grababa
// ni fecha ni cobrador, y la Cuenta de Antonio no encontraba el porte en ningún día.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';
import { calculateDailyAccount } from '../../utils/accountLogic';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const ANTONIO = { id: 7, name: 'ANTONIO MONTES', isActive: true };

const sum1204 = {
    id: 'SUM-1204',
    client: 'IBERMANGUERAS CORDOBESAS SL',
    destinationName: 'TALLERES EL LLANO',
    porteType: 'Debido',
    destinationBillingType: 'Clientes Habituales',
    status: 'Entregado',
    assignedDriverId: 7,
    date: '14/09/2026',
    amount: '€12.00',
    customAmount: 12,
    codAmount: 0,
    hasCod: false,
    portePaid: false,
    packages: '2x BLT_1',
    articles: [],
};

const abrirYMarcarPorteCobrado = async (shipment) => {
    const onUpdate = vi.fn();
    render(
        <ShipmentDetailsModal
            isOpen={true} onClose={() => {}} shipment={shipment} onUpdate={onUpdate}
            drivers={[ANTONIO]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
    const casilla = screen.getByRole('checkbox', { name: /Porte Cobrado/ });
    if (!casilla.checked) fireEvent.click(casilla);
    fireEvent.click(screen.getByText('Guardar Cambios'));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    return onUpdate.mock.calls[0][1];
};

describe('ShipmentDetailsModal: marcar Porte Cobrado desde administración', () => {
    it('sella la fecha del cobro y al conductor asignado como cobrador', async () => {
        const guardado = await abrirYMarcarPorteCobrado(sum1204);
        expect(guardado.portePaid).toBe(true);
        expect(guardado.porteCollectedById).toBe(7);
        expect(new Date(guardado.portePaidAt).toDateString()).toBe(new Date().toDateString());
    });

    it('y con eso los 12 € salen en la Cuenta de Antonio del día', async () => {
        const guardado = await abrirYMarcarPorteCobrado(sum1204);
        const cuenta = calculateDailyAccount({
            allShipments: [{ ...sum1204, ...guardado }],
            driverId: 7,
            clients: [],
            collectedCollections: [],
        });
        expect(cuenta.collectedPorte).toBe(12);
    });

    it('un retoque de la oficina no vuelve a fechar hoy un cobro de otro día', async () => {
        const yaCobrado = { ...sum1204, portePaid: true, portePaidAt: '2026-09-10T09:00:00.000Z', porteCollectedById: 3 };
        const guardado = await abrirYMarcarPorteCobrado(yaCobrado);
        expect(guardado.portePaidAt).toBe('2026-09-10T09:00:00.000Z');
        expect(guardado.porteCollectedById).toBe(3);
    });
});

// ── Quitar un cobro marcado por error con factura simplificada ──
//
// HAB-274, 15 de septiembre de 2026: Juan Carlos entregó y marcó "cobrado con
// factura simplificada" sin querer. La oficina lo abrió desde su Cuenta, quitó el
// check "Porte Cobrado" y pulsó Guardar: el botón no hacía nada porque la ficha
// del conductor no le pasaba función de guardar al modal. Y aunque hubiera
// guardado, la factura simplificada se quedaba puesta y el albarán seguía
// sumando en su Cuenta bajo "Facturas Simplificadas".

const JUAN_CARLOS = { id: 5, name: 'JUAN CARLOS', isActive: true };

const hab274 = {
    ...sum1204,
    id: 'HAB-274',
    assignedDriverId: 5,
    porteCollectedById: 5,
    portePaid: true,
    isPaid: true,
    paymentStatus: 'Paid',
    portePaidAt: new Date().toISOString(),
    hasSimplifiedInvoice: true,
    simplifiedInvoiceAmount: '14.52',
    simplifiedInvoicePaid: true,
};

const cuentaDeJuanCarlos = (albaran) => calculateDailyAccount({
    allShipments: [albaran],
    driverId: 5,
    clients: [],
    collectedCollections: [],
});

describe('ShipmentDetailsModal: quitar un cobro con factura simplificada', () => {
    it('antes de tocarlo, el albarán suma en la Cuenta como factura simplificada', () => {
        expect(cuentaDeJuanCarlos(hab274).collectedSimplifiedInvoices).toBe(14.52);
    });

    it('desmarcar Porte Cobrado quita también la factura simplificada y lo deja pendiente', async () => {
        const onUpdate = vi.fn();
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={hab274} onUpdate={onUpdate}
                drivers={[JUAN_CARLOS]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
            />
        );
        fireEvent.click(screen.getByTitle('Editar'));
        const casilla = screen.getByRole('checkbox', { name: /Porte Cobrado/ });
        expect(casilla.checked).toBe(true);
        fireEvent.click(casilla);
        expect(screen.getByText(/se quita también la Factura Simplificada/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Guardar Cambios'));
        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
        const guardado = onUpdate.mock.calls[0][1];

        expect(guardado.portePaid).toBe(false);
        expect(guardado.isPaid).toBe(false);
        expect(guardado.portePaidAt).toBeNull();
        expect(guardado.porteCollectedById).toBeNull();
        expect(guardado.hasSimplifiedInvoice).toBe(false);
        expect(guardado.simplifiedInvoicePaid).toBe(false);
        expect(guardado.simplifiedInvoiceAmount).toBeNull();

        const cuenta = cuentaDeJuanCarlos({ ...hab274, ...guardado });
        expect(cuenta.collectedSimplifiedInvoices).toBe(0);
        expect(cuenta.collectedPorte).toBe(0);
    });

    it('sin función de guardar el modal no ofrece el lápiz de editar', () => {
        render(
            <ShipmentDetailsModal
                isOpen={true} onClose={() => {}} shipment={hab274}
                drivers={[JUAN_CARLOS]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
            />
        );
        expect(screen.queryByTitle('Editar')).not.toBeInTheDocument();
    });
});

// 23/09/2026: la oficina quiere ver los controles sin pulsar el lápiz, pero
// sin poder tocarlos hasta pulsarlo. El repartidor sigue sin verlos si no edita.
describe('ShipmentDetailsModal: controles de administración a la vista', () => {
    const abrir = (extra = {}) => render(
        <ShipmentDetailsModal
            isOpen={true} onClose={() => {}} shipment={sum1204} onUpdate={vi.fn()}
            drivers={[ANTONIO]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
            {...extra}
        />
    );

    it('en la oficina se ven bloqueados y el lápiz los desbloquea', () => {
        abrir({ showAdminControls: true });
        expect(screen.getByText('Controles de Administración Remota')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /Porte Cobrado/ })).toBeDisabled();
        fireEvent.click(screen.getByTitle('Editar'));
        expect(screen.getByRole('checkbox', { name: /Porte Cobrado/ })).toBeEnabled();
    });

    it('sin la marca de oficina no salen hasta editar', () => {
        abrir();
        expect(screen.queryByText('Controles de Administración Remota')).not.toBeInTheDocument();
    });

    it('en sólo lectura no salen aunque sea la oficina', () => {
        abrir({ showAdminControls: true, isReadOnly: true });
        expect(screen.queryByText('Controles de Administración Remota')).not.toBeInTheDocument();
    });
});
