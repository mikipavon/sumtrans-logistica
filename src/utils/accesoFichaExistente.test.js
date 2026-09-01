import { describe, it, expect } from 'vitest';
import { planDeAcceso, explicarElAcceso } from './accesoFichaExistente';

const solicitud = (extra = {}) => ({
    id: 900,
    name: 'ACTIVA',
    cif: 'B14123456',
    email: 'pedidos@activa.com',
    password: 'secreta123',
    createdFrom: 'web-registro',
    status: 'pending',
    ...extra,
});

describe('planDeAcceso', () => {
    it('la ficha de siempre no tenía acceso: el correo del registro pasa a ser el suyo', () => {
        const ficha = { id: 10, name: 'ACTIVA CORDOBA', clientNumber: 'CH-14', email: 'administracion@activa.com' };
        const plan = planDeAcceso(solicitud(), ficha);

        expect(plan.posible).toBe(true);
        expect(plan.adicional).toBe(false);
        expect(plan.correo).toBe('pedidos@activa.com');
        expect(plan.cambios).toEqual({ accessEmail: 'pedidos@activa.com', tieneAccesoPortal: true });
    });

    it('no toca ningún dato de la ficha: sólo el acceso', () => {
        const ficha = { id: 10, name: 'ACTIVA', address: 'Pol. El Junquillo 83', phone: '957245221', tariffType: 'General' };
        const { cambios } = planDeAcceso(solicitud(), ficha);

        expect(Object.keys(cambios).sort()).toEqual(['accessEmail', 'tieneAccesoPortal']);
    });

    it('la ficha ya entra con otro correo: se le añade el nuevo, no se le quita el suyo', () => {
        const ficha = {
            id: 10,
            name: 'ACTIVA',
            accessEmail: 'dueno@activa.com',
            tieneAccesoPortal: true,
        };
        const plan = planDeAcceso(solicitud(), ficha);

        expect(plan.adicional).toBe(true);
        expect(plan.cambios.accessEmailsExtra).toEqual([{ email: 'pedidos@activa.com' }]);
        expect(plan.cambios.accessEmail).toBeUndefined();
    });

    it('conserva los accesos adicionales que ya había, y sin sus contraseñas', () => {
        const ficha = {
            id: 10,
            accessEmail: 'dueno@activa.com',
            tieneAccesoPortal: true,
            accessEmailsExtra: [{ email: 'albaranes@activa.com', password: 'lasuya' }],
        };
        const plan = planDeAcceso(solicitud(), ficha);

        expect(plan.cambios.accessEmailsExtra).toEqual([
            { email: 'albaranes@activa.com' },
            { email: 'pedidos@activa.com' },
        ]);
    });

    it('el correo ya es el principal de la ficha: no se duplica nada', () => {
        const ficha = { id: 10, email: 'Pedidos@Activa.com', tieneAccesoPortal: true };
        const plan = planDeAcceso(solicitud(), ficha);

        expect(plan.adicional).toBe(false);
        expect(plan.cambios).toEqual({ tieneAccesoPortal: true });
    });

    it('el correo ya figuraba como acceso adicional: tampoco se repite en la lista', () => {
        const ficha = {
            id: 10,
            accessEmail: 'dueno@activa.com',
            tieneAccesoPortal: true,
            accessEmailsExtra: [{ email: 'pedidos@activa.com' }],
        };
        const plan = planDeAcceso(solicitud(), ficha);

        expect(plan.adicional).toBe(true);
        expect(plan.cambios).toEqual({ tieneAccesoPortal: true });
    });

    it('una ficha creada al hacer un albarán no trae correo: no hay acceso que mover', () => {
        expect(planDeAcceso({ id: 900, name: 'FERRETERIA LUNA' }, { id: 10 }).posible).toBe(false);
        expect(planDeAcceso(null, { id: 10 }).posible).toBe(false);
        expect(planDeAcceso(solicitud(), null).posible).toBe(false);
    });
});

describe('explicarElAcceso', () => {
    it('dice la ficha, el correo y que la solicitud se borra', () => {
        const ficha = { id: 10, name: 'ACTIVA CORDOBA', clientNumber: 'CH-14' };
        const texto = explicarElAcceso(solicitud(), ficha, planDeAcceso(solicitud(), ficha));

        expect(texto).toContain('ACTIVA CORDOBA');
        expect(texto).toContain('nº CH-14');
        expect(texto).toContain('pedidos@activa.com');
        expect(texto).toContain('se borra');
    });

    it('sin plan no hay texto', () => {
        expect(explicarElAcceso(solicitud(), {}, { posible: false })).toBe('');
    });
});
