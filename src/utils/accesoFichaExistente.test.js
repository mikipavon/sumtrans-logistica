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

    // La solicitud se borra después de esto. Los datos son los de la oficina y no
    // se traen, pero quién ha recibido allí lo apuntó el repartidor entregando y
    // no está en ningún otro sitio.
    it('se trae a quienes recibieron en la solicitud que se borra', () => {
        const ficha = { id: 10, name: 'ACTIVA', receivers: [{ name: 'Paco', dni: '222B' }] };
        const { cambios } = planDeAcceso(solicitud({ receivers: [{ name: 'Marisa', dni: '111A' }] }), ficha);

        expect(cambios.receivers.map(r => r.name)).toEqual(['Marisa', 'Paco']);
        expect(cambios.lastReceiver).toBeNull();
    });

    it('una solicitud sin nadie apuntado no añade nada a la ficha', () => {
        const ficha = { id: 10, name: 'ACTIVA', receivers: [{ name: 'Paco', dni: '222B' }] };
        const { cambios } = planDeAcceso(solicitud(), ficha);

        expect(cambios.receivers).toBeUndefined();
        expect(Object.keys(cambios)).not.toContain('lastReceiver');
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

    // FRANALMCE (AHORA LA MEJOR COMPRA) se registró el 22/09/2026 y la ficha
    // propuesta era ACTIVA LA MEJOR COMPRA (nº 45), que ya entraba en el portal:
    // otra persona de la misma empresa con su propio correo. Con un parecido de
    // nombre a secas el aviso tiene que decir que no hay nada que lo confirme.
    it('con un nombre sólo parecido avisa de que ni el CIF ni el correo coinciden, y de que el acceso se añade', () => {
        const ficha = { id: 45, name: 'ACTIVA LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.', clientNumber: '45', accessEmail: 'admin@activa.com', tieneAccesoPortal: true };
        const s = solicitud({ name: 'FRANALMCE', cif: 'B99999999', email: 'comercialcordoba@ahoralamejorcompra.com' });
        const texto = explicarElAcceso(s, ficha, planDeAcceso(s, ficha), { soloPorParecido: true });

        expect(texto).toContain('sólo se parecen los nombres');
        expect(texto).toContain('Ni el CIF ni el correo coinciden');
        expect(texto).toContain('«FRANALMCE» es otra empresa');
        expect(texto).toContain('éste se le añade: entrarán los dos');
        expect(texto).not.toContain('el CIF es público');
    });

    it('con el CIF o el correo coincidiendo, el aviso es el de siempre', () => {
        const ficha = { id: 10, name: 'ACTIVA CORDOBA' };
        const texto = explicarElAcceso(solicitud(), ficha, planDeAcceso(solicitud(), ficha), { soloPorParecido: false });

        expect(texto).toContain('el CIF es público');
        expect(texto).not.toContain('sólo se parecen los nombres');
    });
});
