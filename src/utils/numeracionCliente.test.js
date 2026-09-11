import { describe, it, expect } from 'vitest';
import { prefijoDeCliente, siguienteNumeroDeCliente, numeroQueLeFalta, planDeNumeracion } from './numeracionCliente';

describe('prefijoDeCliente', () => {
    it('cada forma de cobro tiene su serie', () => {
        expect(prefijoDeCliente('Presupuesto')).toBe('P-');
        expect(prefijoDeCliente('Clientes Habituales')).toBe('CH-');
        expect(prefijoDeCliente('Facturación')).toBe('');
        expect(prefijoDeCliente(undefined)).toBe('');
    });
});

describe('siguienteNumeroDeCliente', () => {
    it('empieza por el 1 cuando no hay nadie', () => {
        expect(siguienteNumeroDeCliente([], 'CH-')).toBe('CH-1');
        expect(siguienteNumeroDeCliente([], '')).toBe('1');
    });

    it('coge el primer hueco libre, no el último más uno', () => {
        const fichas = [{ clientNumber: 'CH-1' }, { clientNumber: 'CH-3' }];
        expect(siguienteNumeroDeCliente(fichas, 'CH-')).toBe('CH-2');
    });

    it('cada serie cuenta por su cuenta', () => {
        const fichas = [{ clientNumber: 'CH-1' }, { clientNumber: 'P-1' }, { clientNumber: '1' }];
        expect(siguienteNumeroDeCliente(fichas, 'CH-')).toBe('CH-2');
        expect(siguienteNumeroDeCliente(fichas, 'P-')).toBe('P-2');
        expect(siguienteNumeroDeCliente(fichas, '')).toBe('2');
    });

    it('las fichas sin número no ocupan sitio', () => {
        const fichas = [{ clientNumber: '' }, { clientNumber: null }, {}, { clientNumber: '  ' }];
        expect(siguienteNumeroDeCliente(fichas, 'CH-')).toBe('CH-1');
    });
});

describe('numeroQueLeFalta', () => {
    const cartera = [{ clientNumber: 'CH-1' }, { clientNumber: 'CH-2' }];

    it('a la ficha que se quedó sin número le da el siguiente de su serie', () => {
        const ficha = { name: 'SUMINISTROS SECILLA', billingType: 'Clientes Habituales', clientNumber: '' };
        expect(numeroQueLeFalta(ficha, cartera)).toBe('CH-3');
    });

    it('no renumera a quien ya tiene el suyo', () => {
        const ficha = { billingType: 'Clientes Habituales', clientNumber: 'CH-1' };
        expect(numeroQueLeFalta(ficha, cartera)).toBe(null);
    });

    it('manda el número que escribe la oficina', () => {
        const ficha = { billingType: 'Clientes Habituales', clientNumber: '  CH-40  ' };
        expect(numeroQueLeFalta(ficha, cartera)).toBe(null);
    });

    it('sin forma de cobro, la serie a secas', () => {
        const ficha = { billingType: 'Facturación', clientNumber: '' };
        expect(numeroQueLeFalta(ficha, cartera)).toBe('1');
    });
});

describe('planDeNumeracion', () => {
    it('no le da el mismo número a dos fichas de la misma serie', () => {
        const cartera = [{ clientNumber: 'CH-1' }];
        const sinNumero = [
            { id: 1, name: 'UNA', billingType: 'Clientes Habituales' },
            { id: 2, name: 'OTRA', billingType: 'Clientes Habituales' },
            { id: 3, name: 'LA TERCERA', billingType: 'Clientes Habituales' },
        ];
        expect(planDeNumeracion(sinNumero, cartera).map(f => f.clientNumber))
            .toEqual(['CH-2', 'CH-3', 'CH-4']);
    });

    it('cada ficha va a la serie de su forma de cobro', () => {
        const sinNumero = [
            { id: 1, name: 'UNA', billingType: 'Clientes Habituales' },
            { id: 2, name: 'OTRA', billingType: 'Presupuesto' },
            { id: 3, name: 'LA TERCERA', billingType: 'Facturación' },
        ];
        expect(planDeNumeracion(sinNumero, []).map(f => f.clientNumber))
            .toEqual(['CH-1', 'P-1', '1']);
    });

    it('deja fuera a la que ya tiene número', () => {
        const sinNumero = [
            { id: 1, name: 'UNA', billingType: 'Clientes Habituales', clientNumber: 'CH-9' },
            { id: 2, name: 'OTRA', billingType: 'Clientes Habituales' },
        ];
        const plan = planDeNumeracion(sinNumero, []);
        expect(plan).toHaveLength(1);
        expect(plan[0]).toMatchObject({ id: 2, name: 'OTRA', clientNumber: 'CH-1' });
    });

    it('respeta los números de las fichas que no se ven en pantalla', () => {
        // Con el Modo Fantasma echado la oficina no ve las de Clientes
        // Habituales, pero sus números siguen ocupados.
        const carteraCompleta = [{ clientNumber: 'CH-1' }, { clientNumber: 'CH-2' }];
        const alaVista = [{ id: 9, name: 'UNA', billingType: 'Clientes Habituales' }];
        expect(planDeNumeracion(alaVista, carteraCompleta)[0].clientNumber).toBe('CH-3');
    });

    it('sin nadie a quien repasar, no hay plan', () => {
        expect(planDeNumeracion([], [{ clientNumber: 'CH-1' }])).toEqual([]);
    });
});
