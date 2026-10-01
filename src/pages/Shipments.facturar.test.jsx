// ── Exportar a Factusol: la lista de lo que hay que marcar se apunta antes del Excel ──
//
// El FACT se ponía albarán por albarán, en memoria, después de descargar el
// Excel: 2.227 marcados en 13 minutos, una recarga de la página y el resto se
// quedó en el Excel sin etiqueta (SUM-3015, 01/10/2026). Ahora Envíos entrega
// la lista a la app antes de descargar, y la app la marca con su barra y la
// retoma si se recarga (ver utils/marcarFacturados.test.js).

import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Shipments from './Shipments';

vi.mock('../components/shipments/CreateShipmentModal', () => ({ default: () => null }));
vi.mock('../components/shipments/CreatePickupModal', () => ({ default: () => null }));
vi.mock('../components/shipments/ShipmentDetailsModal', () => ({ default: () => null }));
vi.mock('../components/shipments/ImportarAlbaranesAgencia', () => ({ default: () => null }));

const saveAs = vi.hoisted(() => vi.fn());
vi.mock('file-saver', () => ({ saveAs }));
vi.mock('exceljs', () => {
    const fila = () => ({ eachCell: () => {}, height: 0 });
    class Workbook {
        constructor() { this.xlsx = { writeBuffer: async () => new Uint8Array() }; }
        addWorksheet() { return { getRow: fila, addRow: fila }; }
    }
    return { default: { Workbook } };
});

const envio = (id, extra = {}) => ({
    id,
    status: 'Entregado',
    client: 'DISFER',
    billingType: 'Facturación',
    destination: 'Montilla',
    date: '30 sept 2026',
    createdAt: '2026-09-30T09:00:00.000Z',
    amount: 21,
    ...extra,
});

const montar = (shipments, onMarcarFacturados, factOcupado = false) => render(
    <Shipments
        shipments={shipments}
        allShipments={shipments}
        drivers={[]}
        clients={[]}
        allPoblaciones={[]}
        articles={[]}
        tariffs={null}
        coverageZones={[]}
        familyOrder={[]}
        onClearStatusFilter={() => {}}
        onAssignDriver={() => {}}
        onCreateShipment={() => {}}
        onAddClient={() => {}}
        onUpdateClient={() => {}}
        onUpdateShipment={() => {}}
        onUpdateMultipleShipments={() => {}}
        onMarcarFacturados={onMarcarFacturados}
        factOcupado={factOcupado}
        onDeleteShipment={() => {}}
        onDeleteMultipleShipments={() => {}}
    />
);

// El botón de la barra abre la ventana; el de dentro factura.
const abrirVentana = () => {
    fireEvent.click(screen.getByText('Facturar'));
    return screen.getByText('Exportar a Factusol').closest('.fixed');
};

const facturarDesde = (fecha) => {
    const ventana = abrirVentana();
    fireEvent.change(ventana.querySelector('input[type="date"]'), { target: { value: fecha } });
    fireEvent.click(within(ventana).getByText('Facturar'));
};

describe('Exportar a Factusol — la lista se entrega antes de descargar', () => {
    beforeEach(() => {
        saveAs.mockClear();
        vi.spyOn(window, 'alert').mockImplementation(() => {}).mockClear();
    });

    it('entrega los albaranes de facturación de una vez y luego descarga', async () => {
        const marcar = vi.fn(() => {
            // Cuando se apunta la lista, el Excel todavía no ha bajado.
            expect(saveAs).not.toHaveBeenCalled();
            return true;
        });
        montar([envio('SUM-3015'), envio('SUM-3013'), envio('SUM-3010', { billingType: 'Clientes Habituales' })], marcar);

        facturarDesde('2026-09-01');

        await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(2));
        expect(marcar).toHaveBeenCalledTimes(1);
        expect([...marcar.mock.calls[0][0]].sort()).toEqual(['SUM-3013', 'SUM-3015']);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('si la app sigue con la tanda anterior, no descarga y lo dice', async () => {
        const marcar = vi.fn(() => false);
        montar([envio('SUM-3015')], marcar);

        facturarDesde('2026-09-01');

        await waitFor(() => expect(window.alert).toHaveBeenCalled());
        expect(window.alert.mock.calls[0][0]).toContain('exportación anterior');
        expect(saveAs).not.toHaveBeenCalled();
    });

    it('con una tanda en marcha el botón de la ventana no deja facturar', () => {
        montar([envio('SUM-3015')], vi.fn(), true);

        const ventana = abrirVentana();
        expect(within(ventana).getByText('Poniendo el FACT…').closest('button')).toBeDisabled();
    });
});
