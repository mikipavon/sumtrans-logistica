// ── El desplegable de artículos no repite el artículo ──
//
// El desplegable añade el artículo al cambiar, y un <select> nativo con el foco
// puesto cambia con cada flecha del teclado (y en algunos navegadores con la
// rueda del ratón). Como tras cada alta vuelve a «Seleccionar…», la siguiente
// flecha caía otra vez en el primer artículo y en el albarán salía dos veces.
// Ahora el alta espera a que el desplegable se quede quieto y sólo entra el
// último valor; al salir del desplegable entra al momento.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CreateShipmentModal from './CreateShipmentModal';

const ARTICULOS = [
    { id: '1774442159060', name: 'BLT_1', price: 5 },
    { id: '1774442159096', name: 'BLT_6', price: 8 },
];

function abrirAlta() {
    return render(
        <CreateShipmentModal
            isOpen
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={[]}
            allPoblaciones={[]}
            tariffs={[]}
            articles={ARTICULOS}
            defaultCodFee={0}
            familyOrder={[]}
            coverageZones={[]}
            allShipments={[]}
        />
    );
}

// El desplegable no lleva etiqueta enlazada: se reconoce por su primera opción.
const desplegable = () => [...document.querySelectorAll('select')]
    .find(s => s.options[0]?.text.startsWith('Seleccionar artículo'));
const lineas = (nombre) => screen.queryAllByText(nombre).filter(el => el.tagName !== 'OPTION');

describe('CreateShipmentModal — alta de artículos desde el desplegable', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('varias flechas seguidas sólo añaden el último artículo, y una vez', () => {
        abrirAlta();
        const sel = desplegable();

        fireEvent.change(sel, { target: { value: '1774442159060' } });
        fireEvent.change(sel, { target: { value: '1774442159096' } });
        fireEvent.change(sel, { target: { value: '1774442159096' } });
        expect(lineas('BLT_1')).toHaveLength(0);
        expect(lineas('BLT_6')).toHaveLength(0);

        act(() => { vi.advanceTimersByTime(400); });

        expect(lineas('BLT_1')).toHaveLength(0);
        expect(lineas('BLT_6')).toHaveLength(1);
        expect(sel.value).toBe('');
    });

    it('al salir del desplegable el artículo elegido entra al momento', () => {
        abrirAlta();
        const sel = desplegable();

        fireEvent.change(sel, { target: { value: '1774442159096' } });
        fireEvent.blur(sel);

        expect(lineas('BLT_6')).toHaveLength(1);
        act(() => { vi.advanceTimersByTime(400); });
        expect(lineas('BLT_6')).toHaveLength(1);
    });

    it('elegir el mismo artículo dos veces, con calma, sí lo añade dos veces con papeleras distintas', () => {
        abrirAlta();
        const sel = desplegable();

        fireEvent.change(sel, { target: { value: '1774442159096' } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.change(sel, { target: { value: '1774442159096' } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(lineas('BLT_6')).toHaveLength(2);

        // Quitar uno deja el otro (antes compartían id y la papelera se llevaba los dos)
        const papeleras = lineas('BLT_6').map(l => l.closest('.justify-between').querySelector('button'));
        fireEvent.click(papeleras[0]);
        expect(lineas('BLT_6')).toHaveLength(1);
    });
});
