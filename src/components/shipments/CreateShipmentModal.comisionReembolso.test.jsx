// ── La tarifa de reembolso es de quien paga el porte ──
//
// 28/09/2026: VYPSA tiene pactado el reembolso a porcentaje con mínimo de 4 €.
// Un envío suyo a porte debido le cobró esa comisión a su destinatario, porque
// la comisión se calculaba siempre con la ficha del remitente. La comisión va
// dentro del porte: a porte Debido manda la ficha del destinatario y, si no
// tiene tarifa propia, la general de Ajustes.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CreateShipmentModal from './CreateShipmentModal';

const VYPSA = { id: 1, name: 'VYPSA', status: 'approved', codFeeMode: 'porcentaje', codFeePercent: '3', codFeeMin: '4' };
const FERRETERIA = { id: 2, name: 'FERRETERIA LOPEZ', status: 'approved' };
const TALLERES = { id: 3, name: 'TALLERES RUIZ', status: 'approved', codFee: '1.50' };

const abrir = (extra = {}) => render(
    <CreateShipmentModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        clients={[VYPSA, FERRETERIA, TALLERES]}
        allPoblaciones={['Cabra', 'Lucena']}
        tariffs={[]}
        articles={[]}
        defaultCodFee="3.00"
        familyOrder={[]}
        coverageZones={[]}
        allShipments={[]}
        prefillData={{
            type: 'Envío',
            clientName: 'VYPSA',
            originCity: 'Cabra', originZip: '14940',
            destinationName: 'FERRETERIA LOPEZ',
            destinationCity: 'Lucena', destinationZip: '14900',
            amount: '10.00',
            ...extra,
        }}
    />
);

const precio = () => screen.getByPlaceholderText('PRECIO FINAL 0.00').value;
const reembolso = (valor) => fireEvent.change(screen.getByPlaceholderText('REEMBOLSO 0.00'), { target: { value: valor } });
const porte = (tipo) => fireEvent.click(document.querySelector(`input[name="porteType"][value="${tipo}"]`));

describe('CreateShipmentModal — comisión del reembolso según quién paga', () => {
    it('a porte pagado VYPSA paga su tarifa: el mínimo de 4 € y, por encima, el porcentaje', () => {
        abrir({ porteType: 'Pagado' });
        reembolso('50');
        expect(precio()).toBe('14.00');
        reembolso('400');
        expect(precio()).toBe('22.00');
    });

    it('a porte debido el destinatario paga la general, no la tarifa de VYPSA', () => {
        abrir({ porteType: 'Debido' });
        reembolso('50');
        expect(precio()).toBe('13.00');
        reembolso('400');
        expect(precio()).toBe('13.00');
    });

    it('cambiar de Pagado a Debido con el reembolso ya puesto rehace la comisión, y al volver también', () => {
        abrir({ porteType: 'Pagado' });
        reembolso('400');
        expect(precio()).toBe('22.00');

        porte('Debido');
        expect(precio()).toBe('13.00');

        porte('Pagado');
        expect(precio()).toBe('22.00');
    });

    it('a porte debido, si el destinatario tiene su propia tarifa, es la suya', () => {
        abrir({ porteType: 'Debido', destinationName: 'TALLERES RUIZ' });
        reembolso('400');
        expect(precio()).toBe('11.50');
    });
});
