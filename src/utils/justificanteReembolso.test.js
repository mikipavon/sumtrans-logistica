import { describe, it, expect } from 'vitest';
import { documentoDeJustificantes, hojaDelJustificante } from './justificanteReembolso';

const clientes = [
    { name: 'Ferretería Sur', legalName: 'FERRETERIA SUR S.L.', cif: 'B11111111' },
    { name: 'Raúl martin' },
];

const reembolso = {
    id: 'HAB-266', key: 'HAB-266', date: '10/9/2026', client: 'Raúl martin',
    sender: 'Ferretería Sur', type: 'Reembolso', amount: '20.00', amountDisplay: '€20.00',
    original: { id: 'HAB-266' }
};

describe('hojaDelJustificante', () => {
    it('pone el remitente con su nombre comercial y CIF, y la fecha del albarán sin hora', () => {
        const html = hojaDelJustificante(reembolso, { clients: clientes, allShipments: [] });
        expect(html).toContain('Ferretería Sur (CIF: B11111111)');
        expect(html).not.toContain('FERRETERIA SUR S.L.');
        expect(html).toContain('10/9/2026');
        expect(html).toContain('TOTAL: €20.00');
        expect(html).toContain('data-qr="COD:HAB-266"');
    });

    it('si el cobro no trae remitente lo busca en el albarán', () => {
        const cobro = { ...reembolso, sender: 'N/A', original: { shipmentId: 'HAB-266' } };
        const envios = [{ id: 'HAB-266', originName: 'Ferretería Sur', client: 'Raúl martin' }];
        const html = hojaDelJustificante(cobro, { clients: clientes, allShipments: envios });
        expect(html).toContain('Recibe (Remitente):</span>\n                            <span>Ferretería Sur (CIF: B11111111)');
    });
});

describe('documentoDeJustificantes', () => {
    it('saca una hoja por justificante y un salto de página entre ellas', () => {
        const html = documentoDeJustificantes([reembolso, { ...reembolso, id: 'SUM-442', key: 'SUM-442' }], { clients: clientes, allShipments: [] });
        expect(html.match(/class="hoja"/g)).toHaveLength(2);
        expect(html).toContain('.hoja + .hoja { page-break-before: always');
        // La hoja con la proporción del folio y su encogido, como toda ventana de impresión.
        expect(html).toContain('.hoja {');
        expect(html).toContain('ajustarAlFolio');
    });
});
