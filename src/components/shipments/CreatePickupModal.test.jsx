// ── El CP de la recogida se rellena solo al elegir la población ──
//
// El alta de albaranes busca el código postal al elegir la población (primero
// en el listado de Baremos, luego en la lista fija). Al formulario de recogida
// nunca se le copió: elegir del desplegable dejaba el CP vacío y había que
// teclearlo a mano. Estas pruebas fijan el mismo comportamiento en los dos.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CreatePickupModal from './CreatePickupModal';

function abrirRecogida({ coverageZones = [] } = {}) {
    return render(
        <CreatePickupModal
            isOpen
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={[]}
            allPoblaciones={['Montilla', 'Lucena', 'Aguilar de la Frontera']}
            allShipments={[]}
            coverageZones={coverageZones}
        />
    );
}

const campoPoblacion = () => screen.getByPlaceholderText('Población');
// La etiqueta "CP" no va enlazada al input: es el hermano que viene detrás.
const campoCP = () => screen.getByText('CP').nextElementSibling;

describe('CreatePickupModal — población y código postal', () => {
    it('rellena el CP al elegir la población del desplegable', () => {
        abrirRecogida();

        fireEvent.change(campoPoblacion(), { target: { value: 'Mont' } });
        fireEvent.click(screen.getByText('Montilla'));

        expect(campoPoblacion().value).toBe('Montilla');
        expect(campoCP().value).toBe('14550');
    });

    it('prefiere el CP del listado de Baremos al de la lista fija', () => {
        abrirRecogida({ coverageZones: [{ name: 'Montilla', zip: '14551' }] });

        fireEvent.change(campoPoblacion(), { target: { value: 'montilla' } });
        fireEvent.click(screen.getByText('Montilla'));

        expect(campoCP().value).toBe('14551');
    });

    // 14540 es de un solo pueblo en la lista fija. Los CP compartidos (14550 es
    // Montemayor y Montilla) rellenan el primero, igual que en el albarán.
    it('rellena la población al teclear un CP conocido', () => {
        abrirRecogida();

        fireEvent.change(campoCP(), { target: { value: '14540' } });

        expect(campoCP().value).toBe('14540');
        expect(campoPoblacion().value).toBe('La Rambla');
    });

    it('no toca el CP si la población no está en ninguna lista', () => {
        abrirRecogida();

        fireEvent.change(campoCP(), { target: { value: '99999' } });
        fireEvent.change(campoPoblacion(), { target: { value: 'Villarriba' } });

        expect(campoPoblacion().value).toBe('Villarriba');
        expect(campoCP().value).toBe('99999');
    });
});
