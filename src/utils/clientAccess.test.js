import { describe, it, expect } from 'vitest';
import { emailDeAcceso, tieneCorreoDeAccesoPropio } from './clientAccess';

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
