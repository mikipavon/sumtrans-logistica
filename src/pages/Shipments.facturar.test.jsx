// ── Exportar a Factusol: la lista de lo que hay que marcar se apunta antes del Excel ──
//
// El FACT se ponía albarán por albarán, en memoria, después de descargar el
// Excel: 2.227 marcados en 13 minutos, una recarga de la página y el resto se
// quedó en el Excel sin etiqueta (SUM-3015, 01/10/2026). Ahora Envíos entrega
// la lista a la app antes de descargar, y la app la marca con su barra y la
// retoma si se recarga (ver utils/marcarFacturados.test.js).

import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const montar = (shipments, onMarcarFacturados, factOcupado = false, extra = {}) => render(
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
        {...extra}
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

    // HAB-170 (01/10/2026): BOX 77, de facturación, manda a porte debido a Taller
    // Navarro, habitual y sin ficha con ese nombre. El Excel miraba el tipo del
    // remitente y lo sacaba a nombre del destinatario, sin código de cliente.
    it('a porte debido sin ficha del destinatario decide por el tipo del destinatario, no por el del remitente', async () => {
        const marcar = vi.fn(() => true);
        const debido = (id, extra) => envio(id, { client: 'BOX 77 S.L.', porteType: 'Debido', ...extra });
        const cartera = [
            { id: 1, name: 'BOX 77 S.L.', billingType: 'Facturación', clientNumber: '77' },
            { id: 2, name: 'Talleres Lopera', billingType: 'Facturación', clientNumber: '90' },
            { id: 3, name: 'Bar Pepe', billingType: 'Clientes Habituales', clientNumber: 'CH-4', otrosNombres: ['El bar de la plaza'] },
        ];
        montar([
            debido('HAB-170', { destinationName: 'Taller Navarro', destinationBillingType: 'Clientes Habituales' }),
            debido('HAB-172', { destinationName: 'Damve pigroup' }),
            debido('HAB-173', { destinationName: 'El bar de la plaza', destinationBillingType: 'Facturación' }),
            debido('SUM-800', { destinationName: 'TALLERES LOPERA', destinationBillingType: 'Clientes Habituales' }),
            debido('SUM-801', { destinationName: 'Sin ficha pero de factura', destinationBillingType: 'Facturación' }),
        ], marcar, false, { clients: cartera });

        facturarDesde('2026-09-01');

        await waitFor(() => expect(marcar).toHaveBeenCalledTimes(1));
        expect([...marcar.mock.calls[0][0]].sort()).toEqual(['SUM-800', 'SUM-801']);
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

// Volver atrás: el 01/10/2026 salieron tres Excel seguidos (el grande, los 376
// repetidos y uno suelto) y había que poder deshacer el de en medio.
describe('Exportar a Factusol — deshacer una facturación de los últimos días', () => {
    const ANTES = '2026-10-01T15:00:00.000Z';
    const DESPUES = '2026-10-01T15:52:00.000Z';
    const SUELTO = '2026-10-01T16:09:00.000Z';
    const facturados = () => [
        envio('SUM-3154', { exportedAt: SUELTO }),
        envio('SUM-3015', { exportedAt: DESPUES }),
        envio('SUM-3013', { exportedAt: DESPUES }),
        envio('SUM-3010', { exportedAt: ANTES }),
        envio('SUM-2000', { exportedAt: '2026-09-20T10:00:00.000Z' }),
        envio('SUM-3009'),
    ];

    beforeEach(() => {
        vi.useFakeTimers({ now: new Date('2026-10-01T17:00:00.000Z'), toFake: ['Date'] });
        vi.spyOn(window, 'alert').mockImplementation(() => {}).mockClear();
    });
    afterEach(() => vi.useRealTimers());

    it('lista cada facturación con su fecha y cuántos albaranes, y deshace la elegida tras confirmar y la contraseña', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const contrasena = vi.fn(async () => true);
        const deshacer = vi.fn(async () => true);
        montar(facturados(), vi.fn(), false, { onDeshacerFacturacion: deshacer, onAutorizarConContrasena: contrasena });

        const ventana = abrirVentana();
        const filas = within(ventana).getAllByText('Deshacer').map(b => b.closest('li').textContent);
        expect(filas).toHaveLength(3); // la de hace once días no sale
        expect(filas[0]).toContain('1 albarán');
        expect(filas[1]).toContain('2 albaranes');
        expect(filas[2]).toContain('1 albarán');
        fireEvent.click(within(ventana).getAllByText('Deshacer')[1]);

        await waitFor(() => expect(deshacer).toHaveBeenCalledWith(DESPUES));
        expect(window.confirm.mock.calls[0][0]).toContain('2 albaranes');
        expect(contrasena).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Exportar a Factusol')).toBeNull();
    });

    it('sin la contraseña no deshace nada', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const deshacer = vi.fn(async () => true);
        montar(facturados(), vi.fn(), false, { onDeshacerFacturacion: deshacer, onAutorizarConContrasena: async () => false });

        fireEvent.click(within(abrirVentana()).getAllByText('Deshacer')[0]);

        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(deshacer).not.toHaveBeenCalled();
        expect(screen.getByText('Exportar a Factusol')).toBeInTheDocument();
    });

    it('sin nada facturado en los últimos días no sale el bloque', () => {
        montar([envio('SUM-3009'), envio('SUM-2000', { exportedAt: '2026-09-20T10:00:00.000Z' })], vi.fn(), false, { onDeshacerFacturacion: vi.fn() });

        expect(within(abrirVentana()).queryByText('Deshacer')).toBeNull();
    });
});
