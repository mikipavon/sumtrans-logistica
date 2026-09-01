import { describe, it, expect } from 'vitest';
import { emailDeAcceso, tieneCorreoDeAccesoPropio, accesosAdicionales, correosDeAcceso, fichaSinContrasenas } from './clientAccess';

describe('emailDeAcceso', () => {
    it('usa el correo de acceso cuando la ficha lo trae', () => {
        expect(emailDeAcceso({ email: 'administracion@empresa.com', accessEmail: 'pedidos@empresa.com' }))
            .toBe('pedidos@empresa.com');
    });

    it('cae al email de la ficha si no hay correo de acceso — las fichas de siempre no cambian', () => {
        expect(emailDeAcceso({ email: 'cliente@empresa.com' })).toBe('cliente@empresa.com');
        expect(emailDeAcceso({ email: 'cliente@empresa.com', accessEmail: '' })).toBe('cliente@empresa.com');
        expect(emailDeAcceso({ email: 'cliente@empresa.com', accessEmail: '   ' })).toBe('cliente@empresa.com');
    });

    it('normaliza a minúsculas y sin espacios: Auth guarda así los emails', () => {
        expect(emailDeAcceso({ accessEmail: '  Pedidos@Empresa.COM ' })).toBe('pedidos@empresa.com');
        expect(emailDeAcceso({ email: ' Cliente@Empresa.com' })).toBe('cliente@empresa.com');
    });

    it('devuelve cadena vacía si no hay ninguno de los dos', () => {
        expect(emailDeAcceso({})).toBe('');
        expect(emailDeAcceso(null)).toBe('');
        expect(emailDeAcceso(undefined)).toBe('');
    });
});

describe('tieneCorreoDeAccesoPropio', () => {
    it('sólo es cierto si el correo de acceso difiere del de la ficha', () => {
        expect(tieneCorreoDeAccesoPropio({ email: 'a@x.com', accessEmail: 'b@x.com' })).toBe(true);
        expect(tieneCorreoDeAccesoPropio({ email: 'a@x.com', accessEmail: 'A@X.com' })).toBe(false);
        expect(tieneCorreoDeAccesoPropio({ email: 'a@x.com' })).toBe(false);
        expect(tieneCorreoDeAccesoPropio({})).toBe(false);
    });
});

describe('accesosAdicionales', () => {
    it('devuelve los correos adicionales con su contraseña', () => {
        const ficha = {
            accessEmail: 'pedidos@empresa.com',
            accessEmailsExtra: [{ email: 'dueno@empresa.com', password: 'secreta1' }],
        };
        expect(accesosAdicionales(ficha)).toEqual([{ email: 'dueno@empresa.com', password: 'secreta1' }]);
    });

    it('normaliza igual que el principal: minúsculas y sin espacios', () => {
        const ficha = { accessEmailsExtra: [{ email: '  Dueno@Empresa.COM ' }] };
        expect(accesosAdicionales(ficha)).toEqual([{ email: 'dueno@empresa.com', password: '' }]);
    });

    it('descarta filas vacías, repetidas y la que repite el principal', () => {
        const ficha = {
            accessEmail: 'pedidos@empresa.com',
            accessEmailsExtra: [
                { email: '' },
                { email: 'dueno@empresa.com' },
                { email: 'DUENO@empresa.com' },
                { email: 'pedidos@empresa.com' },
            ],
        };
        expect(accesosAdicionales(ficha).map(a => a.email)).toEqual(['dueno@empresa.com']);
    });

    it('el principal también se descarta cuando sale del email de contacto', () => {
        const ficha = {
            email: 'oficina@empresa.com',
            accessEmailsExtra: [{ email: 'oficina@empresa.com' }, { email: 'dueno@empresa.com' }],
        };
        expect(accesosAdicionales(ficha).map(a => a.email)).toEqual(['dueno@empresa.com']);
    });

    it('una ficha de siempre no tiene ninguno', () => {
        expect(accesosAdicionales({ email: 'cliente@empresa.com' })).toEqual([]);
        expect(accesosAdicionales(null)).toEqual([]);
    });
});

describe('correosDeAcceso', () => {
    it('el principal primero y detrás los adicionales', () => {
        const ficha = {
            email: 'facturas@empresa.com',
            accessEmail: 'pedidos@empresa.com',
            accessEmailsExtra: [{ email: 'dueno@empresa.com' }],
        };
        expect(correosDeAcceso(ficha)).toEqual(['pedidos@empresa.com', 'dueno@empresa.com']);
    });

    it('sin correo ninguno devuelve la lista vacía, no una llena de huecos', () => {
        expect(correosDeAcceso({})).toEqual([]);
    });
});

describe('fichaSinContrasenas', () => {
    it('quita la contraseña principal y las de los accesos adicionales', () => {
        const guardada = fichaSinContrasenas({
            name: 'ACTIVA',
            password: 'principal1',
            accessEmail: 'pedidos@empresa.com',
            accessEmailsExtra: [{ email: 'dueno@empresa.com', password: 'secreta1' }],
        });
        expect(guardada.password).toBeUndefined();
        expect(guardada.accessEmailsExtra).toEqual([{ email: 'dueno@empresa.com' }]);
        expect(guardada.name).toBe('ACTIVA');
    });

    it('no inventa el array en las fichas que no lo traen', () => {
        const guardada = fichaSinContrasenas({ name: 'ACTIVA', email: 'cliente@empresa.com' });
        expect('accessEmailsExtra' in guardada).toBe(false);
    });

    it('no toca la ficha original', () => {
        const original = { password: 'principal1', accessEmailsExtra: [{ email: 'a@x.com', password: 'p1' }] };
        fichaSinContrasenas(original);
        expect(original.password).toBe('principal1');
        expect(original.accessEmailsExtra[0].password).toBe('p1');
    });
});
