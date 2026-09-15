import { describe, it, expect } from 'vitest';
import { documentoDeResumenPorte, filaDelPorte } from './resumenDePorte';
import { calculateDailyAccount } from './accountLogic';

const clientes = [
    { name: 'Ferretería Sur', legalName: 'FERRETERIA SUR S.L.', cif: 'B11111111', billingType: 'Clientes Habituales' },
    { name: 'Raúl martin', billingType: 'Clientes Habituales' },
];

const porte = {
    id: 'HAB-266', key: 'del-HAB-266', date: '10/9/2026', client: 'Raúl martin',
    sender: 'Ferretería Sur', receiver: 'Raúl martin', payer: 'receiver',
    sourceTitle: 'Cobro Entrega', amount: '12.00'
};

describe('filaDelPorte', () => {
    it('pone la fecha sin hora, la razón social y subraya al que paga', () => {
        const html = filaDelPorte(porte, { clients: clientes });
        expect(html).toContain('10/9/2026 FERRETERIA SUR S.L. - <u><b>Raúl martin</b></u>');
        expect(html).toContain('Cobro Entrega');
        expect(html).toContain('€12.00');
    });
});

describe('documentoDeResumenPorte', () => {
    it('es el mismo ticket para el repartidor y para la oficina: conductor, fecha pedida y total de la Cuenta', () => {
        const dia = '2026-09-10';
        const envios = [{
            id: 'HAB-266', assignedDriverId: 7, status: 'Entregado', client: 'Raúl martin',
            destinationName: 'Raúl martin', originName: 'Ferretería Sur', porteType: 'Debido',
            amount: '12.00', portePaid: true, portePaidAt: `${dia}T11:00:00Z`,
            deliveredAt: `${dia}T11:00:00Z`, date: '10/9/2026'
        }];
        const cuenta = calculateDailyAccount({
            allShipments: envios, driverId: 7, clients: clientes,
            collectedCollections: [], targetDate: new Date(2026, 8, 10)
        });
        const html = documentoDeResumenPorte(cuenta.allPorteDetail, {
            driver: { name: 'Juan Carlos', id: 7 }, fecha: new Date(2026, 8, 10), clients: clientes, total: cuenta.collectedPorte
        });
        expect(html).toContain('Resumen de Porte');
        expect(html).toContain('Juan Carlos (DRV-7)');
        expect(html).toContain(`<strong>Fecha:</strong> ${new Date(2026, 8, 10).toLocaleDateString()}`);
        expect(html).toContain('TOTAL PORTE: €12.00');
        // La hoja de 105 mm con su encogido al folio, como el resto de tickets.
        expect(html).toContain("width: 105mm");
        expect(html).toContain('ajustarAlFolio');
    });

    it('sin facturas simplificadas es una sola hoja, sin salto de página que sobre', () => {
        const html = documentoDeResumenPorte([porte], { driver: { name: 'Juan Carlos' }, clients: clientes, facturasSimplificadas: [] });
        expect(html.match(/class="hoja"/g)).toHaveLength(1);
        expect(html).not.toContain('Facturas Simplificadas');
    });

    it('con facturas simplificadas saca los cobros en una hoja y las facturas en otra, con base e IVA', () => {
        const factura = { id: 'HAB-306', key: 'fs-HAB-306', client: 'ECUGENIL', base: '10.00', iva: '2.10', amount: '12.10' };
        const html = documentoDeResumenPorte([porte], {
            driver: { name: 'Juan Carlos', id: 7 }, clients: clientes, total: 12,
            facturasSimplificadas: [factura], totalFacturas: 12.1
        });
        expect(html.match(/class="hoja"/g)).toHaveLength(2);
        expect(html).toContain('.hoja + .hoja { page-break-before: always');
        const [cobros, facturas] = html.split('class="hoja"').slice(1);
        expect(cobros).toContain('Resumen de Porte');
        expect(cobros).toContain('TOTAL PORTE: €12.00');
        expect(cobros).not.toContain('HAB-306');
        expect(facturas).toContain('Facturas Simplificadas');
        expect(facturas).toContain('HAB-306 ECUGENIL');
        expect(facturas).toContain('Base imponible:</span><span>€10.00');
        expect(facturas).toContain('IVA 21%:</span><span>€2.10');
        expect(facturas).toContain('TOTAL FACTURAS: €12.10');
        expect(facturas).not.toContain('TOTAL PORTE');
    });

    it('no lleva la coletilla de "solo clientes habituales / contado" al pie', () => {
        const html = documentoDeResumenPorte([porte], { driver: { name: 'Juan Carlos' }, clients: clientes });
        expect(html).not.toContain('Solo incluye clientes');
    });

    it('sin portes lo dice en la tabla y el total sale a cero', () => {
        const html = documentoDeResumenPorte([], { driver: { name: 'Juan Carlos' } });
        expect(html).toContain('Sin cobros de porte hoy');
        expect(html).toContain('TOTAL PORTE: €0.00');
    });
});
