import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import Dashboard from './Dashboard';
import { coincideCliente } from '../utils/filtrosEnvios';

// El desplegable "Ingresos por cliente" con sus cinco opciones, sobre un caso
// como el que se ve en la oficina: un cliente de presupuesto aparece en más
// albaranes de los que paga. La tabla cuenta sólo los que paga.

afterEach(cleanup);

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00:00`;
};

const clientes = [
    { id: 1, name: 'AGRO INDUSTRIAS VELASCO', billingType: 'Presupuesto' },
    { id: 2, name: 'TALLERES LOPERA', billingType: 'Presupuesto', otrosNombres: ['LOPERA TALLERES SL'] },
    { id: 3, name: 'Muebles Pérez', billingType: 'Facturación' },
    { id: 4, name: 'Bar Manolo', billingType: 'Clientes Habituales' }
];

let n = 0;
const albaran = (datos) => ({ id: `e${++n}`, createdAt: hoy(), status: 'Entregado', porteType: 'Pagado', amount: '€7.00', ...datos });
const veces = (cuantas, datos) => Array.from({ length: cuantas }, () => albaran(datos));

const envios = [
    ...veces(12, { client: 'AGRO INDUSTRIAS VELASCO', destinationName: 'Bar Manolo', amount: '€8.00' }),
    // Lopera aparece en 11 albaranes, pero sólo paga 5.
    ...veces(5, { client: 'TALLERES LOPERA', destinationName: 'Bar Manolo' }),
    ...veces(3, { client: 'TALLERES LOPERA', destinationName: 'Bar Manolo', porteType: 'Debido' }),
    ...veces(3, { client: 'Muebles Pérez', destinationName: 'TALLERES LOPERA', amount: '€10.00' })
];

const abrir = (props = {}) => {
    render(<Dashboard shipments={envios} clients={clientes} vehicles={[]} drivers={[]} isGhostModeUnlocked {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Ingresos por cliente/ }));
};

const elegir = (valor) =>
    fireEvent.change(screen.getByLabelText('Qué ingresos mostrar por cliente'), { target: { value: valor } });

/** Las filas de la tabla como [cliente, albaranes, importe], y el pie aparte. */
const leerTabla = () => {
    const tabla = screen.getByRole('table');
    const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent.trim());
    const [, cuerpo, pie] = within(tabla).getAllByRole('rowgroup');
    return {
        filas: within(cuerpo).getAllByRole('row').map(celdas).map((c) => [c[0], c[2], c[3]]),
        pie: celdas(within(pie).getByRole('row'))
    };
};

describe('Ingresos por cliente: las cinco opciones del desplegable', () => {
    it('el listado de Envíos enseña 11 albaranes de Lopera: los que paga, remite o recibe', () => {
        expect(envios.filter((e) => coincideCliente(e, 'TALLERES LOPERA'))).toHaveLength(11);
    });

    it('Presupuestos: sólo lo que paga cada cliente de presupuesto', () => {
        abrir();
        elegir('presupuestos');
        const { filas, pie } = leerTabla();
        expect(filas).toEqual([
            ['AGRO INDUSTRIAS VELASCO', '12', '€96,00'],
            ['TALLERES LOPERA', '5', '€35,00']
        ]);
        expect(pie[2]).toBe('17');
        expect(pie[3]).toBe('€131,00');
    });

    it('el recibo del cierre de presupuestos no suma: sus albaranes ya contaron', () => {
        const recibo = albaran({
            id: 'RC-567035', type: 'Recibo', client: 'TALLERES LOPERA', clientId: 2,
            destinationName: 'TALLERES LOPERA', destination: 'Cobro de Presupuesto',
            amount: '35.00', customAmount: 35, status: 'Pendiente de asignar',
            observations: 'Cobro mensual presupuestos acumulados (Septiembre de 2026). Incluye 5 envíos.'
        });
        abrir({ shipments: [...envios, recibo] });
        elegir('presupuestos');
        const { filas, pie } = leerTabla();
        expect(filas).toContainEqual(['TALLERES LOPERA', '5', '€35,00']);
        expect(pie[3]).toBe('€131,00');
    });

    it('Facturación: lo que Pérez manda a Lopera es de Pérez', () => {
        abrir();
        elegir('facturacion');
        expect(leerTabla().filas).toEqual([['Muebles Pérez', '3', '€30,00']]);
    });

    it('Clientes Habituales: el porte debido de Lopera lo paga Manolo', () => {
        abrir();
        elegir('habituales');
        expect(leerTabla().filas).toEqual([['Bar Manolo', '3', '€21,00']]);
    });

    it('Todo: los 23 albaranes, cada uno en una sola fila', () => {
        abrir();
        elegir('todas');
        const { filas, pie } = leerTabla();
        expect(filas).toEqual([
            ['AGRO INDUSTRIAS VELASCO', '12', '€96,00'],
            ['TALLERES LOPERA', '5', '€35,00'],
            ['Muebles Pérez', '3', '€30,00'],
            ['Bar Manolo', '3', '€21,00']
        ]);
        expect(pie[2]).toBe('23');
        expect(pie[3]).toBe('€182,00');
    });

    it('Según las líneas marcadas: sigue a las casillas de la gráfica', () => {
        abrir();
        expect(leerTabla().pie[3]).toBe('€182,00');
        fireEvent.click(screen.getByLabelText(/Presupuestos/));
        expect(leerTabla().filas.map((f) => f[0])).toEqual(['Muebles Pérez', 'Bar Manolo']);
    });

    it('el buscador esconde filas y el pie suma sólo las que se ven', () => {
        abrir();
        elegir('todas');
        fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'lopera' } });
        const { filas, pie } = leerTabla();
        expect(filas).toEqual([['TALLERES LOPERA', '5', '€35,00']]);
        expect(pie[2]).toBe('5');
        expect(pie[3]).toBe('€35,00');
    });

    it('un albarán de hace un mes no entra en los últimos 7 días', () => {
        const viejo = new Date();
        viejo.setDate(viejo.getDate() - 30);
        const antiguos = [...envios, albaran({ client: 'TALLERES LOPERA', createdAt: viejo.toISOString() })];
        abrir({ shipments: antiguos });
        elegir('presupuestos');
        expect(leerTabla().filas[1]).toEqual(['TALLERES LOPERA', '5', '€35,00']);
    });

    it('un albarán escrito con otro nombre de la ficha cuenta para esa ficha', () => {
        const conAlias = [...envios, albaran({ client: 'Lopera Talleres SL', destinationName: 'Bar Manolo' })];
        abrir({ shipments: conAlias });
        elegir('presupuestos');
        expect(leerTabla().filas[1]).toEqual(['TALLERES LOPERA', '6', '€42,00']);
    });
});
