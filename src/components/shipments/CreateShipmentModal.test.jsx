// ── El desplegable de artículos no repite el artículo ──
//
// El desplegable añade el artículo al cambiar, y un <select> nativo con el foco
// puesto cambia con cada flecha del teclado (y en algunos navegadores con la
// rueda del ratón). Como tras cada alta vuelve a «Seleccionar…», la siguiente
// flecha caía otra vez en el primer artículo y en el albarán salía dos veces.
// Ahora el alta espera a que el desplegable se quede quieto y sólo entra el
// último valor; al salir del desplegable entra al momento.

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

// ── El buscador escondía fichas que sí salen en la lista de Clientes ──
//
// La lista maestra de Clientes sólo esconde lo que está pendiente de validar.
// El buscador del albarán pedía status === 'approved', más estricto, así que
// una ficha con cualquier otro estado (los que deja una importación o una copia
// restaurada) se veía en Clientes y no había forma de ponerla en un albarán.

const CLIENTES_POR_ESTADO = [
    { id: 1, name: 'ADAMUZ Y CENTELLA EL PLANE', status: 'activo', city: 'CORDOBA' },
    { id: 2, name: 'ADAMUZ RECIEN DADO DE ALTA', status: 'pending', city: 'CORDOBA' },
    { id: 3, name: 'ADAMUZ DE TODA LA VIDA', status: 'approved', city: 'CORDOBA' },
    { id: 4, name: 'ADAMUZ SIN ESTADO', city: 'CORDOBA' },
];

function abrirAltaConClientes() {
    return render(
        <CreateShipmentModal
            isOpen
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={CLIENTES_POR_ESTADO}
            allPoblaciones={['CORDOBA']}
            tariffs={[]}
            articles={[]}
            defaultCodFee={0}
            familyOrder={[]}
            coverageZones={[]}
            allShipments={[]}
        />
    );
}

describe('CreateShipmentModal — qué fichas ofrece el buscador', () => {
    it('ofrece la ficha con un estado distinto de approved, igual que la lista de Clientes', () => {
        abrirAltaConClientes();

        fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'adamuz' } });

        expect(screen.getByText('ADAMUZ Y CENTELLA EL PLANE')).toBeInTheDocument();
        expect(screen.getByText('ADAMUZ DE TODA LA VIDA')).toBeInTheDocument();
        expect(screen.getByText('ADAMUZ SIN ESTADO')).toBeInTheDocument();
    });

    it('sigue escondiendo lo que está pendiente de validar', () => {
        abrirAltaConClientes();

        fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'adamuz' } });

        expect(screen.queryByText('ADAMUZ RECIEN DADO DE ALTA')).not.toBeInTheDocument();
    });

    it('aplica la misma regla al destinatario', () => {
        abrirAltaConClientes();

        fireEvent.change(screen.getByPlaceholderText('Buscar destino...'), { target: { value: 'adamuz' } });

        expect(screen.getByText('ADAMUZ Y CENTELLA EL PLANE')).toBeInTheDocument();
        expect(screen.queryByText('ADAMUZ RECIEN DADO DE ALTA')).not.toBeInTheDocument();
    });
});

// ── Terminar una recogida que ya trae destinatario y precio ──
//
// La oficina puede dejar apuntados en la recogida el destinatario y el precio
// (CreatePickupModal). Al terminarla, el repartidor abre este alta rellenada con
// la recogida: remitente, destinatario y precio tienen que salir puestos. El
// precio viene como «€12.00» (formato de los albaranes) y la casilla es numérica:
// hay que pasárselo en número o se queda en blanco.

import { precioDeLaRecogida } from '../../utils/precioDeLaRecogida';

const RECOGIDA_COMPLETA = {
    id: 'REC-600',
    type: 'Recogida',
    client: 'AGRICOLA CASTILLERO',
    originAddress: 'Ctra. Vieja 1',
    originCity: 'Montilla',
    originZip: '14550',
    originPhone: '957650000',
    destinationName: 'FERRETERIA LUCENA',
    destinationAddress: 'C/ Ancha 4',
    destinationCity: 'Lucena',
    destinationZip: '14900',
    destinationPhone: '600500500',
    amount: '€12.00',
    customAmount: 12,
    porteType: 'Debido'
};

describe('CreateShipmentModal — alta desde una recogida con destinatario y precio', () => {
    it('sale con remitente, destinatario y precio ya puestos', () => {
        render(
            <CreateShipmentModal
                isOpen
                isDriver
                onClose={vi.fn()}
                onSave={vi.fn()}
                clients={[]}
                allPoblaciones={['Montilla', 'Lucena']}
                tariffs={[]}
                articles={[]}
                defaultCodFee={0}
                familyOrder={[]}
                coverageZones={[]}
                allShipments={[]}
                prefillData={RECOGIDA_COMPLETA}
            />
        );

        expect(screen.getByPlaceholderText('Buscar cliente...').value).toBe('AGRICOLA CASTILLERO');
        expect(screen.getByPlaceholderText('Buscar destino...').value).toBe('FERRETERIA LUCENA');
        expect(screen.getByDisplayValue('C/ Ancha 4')).toBeInTheDocument();
        expect(screen.getByDisplayValue('600500500')).toBeInTheDocument();
        expect(screen.getByDisplayValue('12')).toBeInTheDocument();
    });

    it('el precio de la recogida se traduce a número para la casilla; sin precio queda vacío', () => {
        expect(precioDeLaRecogida({ amount: '€12.00', customAmount: 12 })).toBe('12');
        expect(precioDeLaRecogida({ amount: '€7.50' })).toBe('7.5');
        expect(precioDeLaRecogida({ amount: 'Por valorar', customAmount: null })).toBe('');
        expect(precioDeLaRecogida({ amount: 'Por valorar', customAmount: 0 })).toBe('');
        expect(precioDeLaRecogida(undefined)).toBe('');
    });

    const abrirDesdeRecogida = (recogida, allShipments = []) => render(
        <CreateShipmentModal
            isOpen
            isDriver
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={[]}
            allPoblaciones={['Montilla', 'Lucena']}
            tariffs={[]}
            articles={ARTICULOS}
            defaultCodFee={0}
            familyOrder={[]}
            coverageZones={[]}
            allShipments={allShipments}
            prefillData={recogida}
        />
    );
    const precio = () => screen.getByPlaceholderText('PRECIO FINAL 0.00').value;

    // El 22/09/2026 una recogida a 50 € se convirtió, el repartidor apuntó un
    // bulto de 7 € y la casilla pasó a 7 €: los 50 € acordados se perdieron. El
    // precio fijado en la recogida manda; los artículos sólo se apuntan.
    it('apuntar o quitar un artículo no pisa el precio fijado en la recogida', () => {
        abrirDesdeRecogida(RECOGIDA_COMPLETA);
        expect(precio()).toBe('12');

        const sel = desplegable();
        fireEvent.change(sel, { target: { value: '1774442159060' } });
        fireEvent.blur(sel);
        expect(lineas('BLT_1')).toHaveLength(1);
        expect(precio()).toBe('12');

        fireEvent.click(lineas('BLT_1')[0].closest('.justify-between').querySelector('button'));
        expect(lineas('BLT_1')).toHaveLength(0);
        expect(precio()).toBe('12');
    });

    it('una recogida sin precio («Por valorar») deja que los artículos pongan el precio', () => {
        abrirDesdeRecogida({ ...RECOGIDA_COMPLETA, amount: 'Por valorar', customAmount: null });
        const sel = desplegable();
        fireEvent.change(sel, { target: { value: '1774442159060' } });
        fireEvent.blur(sel);
        expect(precio()).toBe('5.00');
    });

    // La recogida sigue en la lista de envíos hasta que el albarán se guarda, y
    // con el precio fijado salía en «Cobros pendientes» del aviso de cobro como
    // una deuda más (REC-651, 50 €). Una recogida no es una deuda.
    it('el aviso de cobro no ofrece la propia recogida como cobro pendiente', async () => {
        const recogidaPagada = { ...RECOGIDA_COMPLETA, porteType: 'Pagado' };
        const deudaDeVerdad = { id: 'HAB-9', type: 'Envío', client: 'AGRICOLA CASTILLERO', porteType: 'Pagado', amount: '€5.00', portePaid: false, status: 'Entregado' };
        abrirDesdeRecogida(recogidaPagada, [recogidaPagada, deudaDeVerdad]);
        fireEvent.change(screen.getByPlaceholderText('Instrucciones adicionales...'), { target: { value: '1 caja' } });
        fireEvent.submit(screen.getByText('Generar Albarán').closest('form'));

        await waitFor(() => expect(screen.getByText('Atribución de Cobro al Contado')).toBeInTheDocument());
        expect(screen.getByText('HAB-9')).toBeInTheDocument();
        expect(screen.queryByText('REC-600')).not.toBeInTheDocument();
    });
});

// ── Población fuera de baremo: aviso antes de la ventana de cobro (22/09/2026) ──
//
// Un destino que no sale en el Baremo 1 ni en el 2 se para al generar el
// albarán: hay que preguntar a la oficina el precio, el peso y las medidas.
// "Continuar" sigue con la ventana de cobro; "Volver" deja el alta como estaba.
describe('CreateShipmentModal — aviso de población fuera de baremo', () => {
    const fueraDeBaremo = { ...RECOGIDA_COMPLETA, porteType: 'Pagado', destinationCity: 'Pueblo Inventado', destinationZip: '29999' };
    const abrir = () => render(
        <CreateShipmentModal
            isOpen
            isDriver
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={[]}
            allPoblaciones={['Montilla', 'Lucena']}
            tariffs={[]}
            articles={ARTICULOS}
            defaultCodFee={0}
            familyOrder={[]}
            coverageZones={[]}
            allShipments={[]}
            prefillData={fueraDeBaremo}
        />
    );
    const generar = () => {
        fireEvent.change(screen.getByPlaceholderText('Instrucciones adicionales...'), { target: { value: '1 caja' } });
        fireEvent.submit(screen.getByText('Generar Albarán').closest('form'));
    };

    it('al generar sale el aviso con lo que hay que preguntar, y todavía no la ventana de cobro', async () => {
        abrir();
        expect(screen.getByText('FUERA DE BAREMO · MÍN. 12 €')).toBeInTheDocument();
        generar();
        await waitFor(() => expect(screen.getByText('¡Fuera de Baremo!')).toBeInTheDocument());
        const aviso = screen.getByRole('alertdialog');
        expect(aviso.textContent).toContain('Preguntar a la oficina');
        expect(aviso.textContent).toContain('Precio');
        expect(aviso.textContent).toContain('Peso');
        expect(aviso.textContent).toContain('Medidas');
        expect(screen.queryByText('Atribución de Cobro al Contado')).not.toBeInTheDocument();
    });

    it('ENTENDIDO pasa a la ventana de cobro con el albarán que ya estaba montado', async () => {
        abrir();
        generar();
        await waitFor(() => expect(screen.getByText('¡Fuera de Baremo!')).toBeInTheDocument());
        fireEvent.click(screen.getByText('ENTENDIDO, CONTINUAR'));
        await waitFor(() => expect(screen.getByText('Atribución de Cobro al Contado')).toBeInTheDocument());
        expect(screen.queryByText('¡Fuera de Baremo!')).not.toBeInTheDocument();
    });

    it('Volver cierra el aviso y no abre nada más', async () => {
        abrir();
        generar();
        await waitFor(() => expect(screen.getByText('¡Fuera de Baremo!')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Volver al albarán'));
        expect(screen.queryByText('¡Fuera de Baremo!')).not.toBeInTheDocument();
        expect(screen.queryByText('Atribución de Cobro al Contado')).not.toBeInTheDocument();
        expect(screen.getByText('Generar Albarán')).toBeInTheDocument();
    });
});
