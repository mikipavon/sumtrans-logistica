import { describe, it, expect } from 'vitest';
import { correosDeFicha, primerCorreoDeFicha } from './correosDeFicha';

describe('correosDeFicha', () => {
    it('separa la lista que teclea la oficina, con o sin espacios', () => {
        // Tal cual estaba escrito en la ficha que no dejaba guardar.
        expect(correosDeFicha('marc.mora@cm93.com ; rosario.yebras@cm93.com ; proveedores@cm93.com'))
            .toEqual(['marc.mora@cm93.com', 'rosario.yebras@cm93.com', 'proveedores@cm93.com']);
        expect(correosDeFicha('uno@x.com;dos@x.com')).toEqual(['uno@x.com', 'dos@x.com']);
        expect(correosDeFicha('uno@x.com, dos@x.com')).toEqual(['uno@x.com', 'dos@x.com']);
        expect(correosDeFicha('uno@x.com dos@x.com')).toEqual(['uno@x.com', 'dos@x.com']);
    });

    it('un solo correo sigue siendo un solo correo', () => {
        expect(correosDeFicha('cliente@empresa.com')).toEqual(['cliente@empresa.com']);
        expect(correosDeFicha('  cliente@empresa.com  ')).toEqual(['cliente@empresa.com']);
    });

    it('pasa a minúsculas, que es como los guarda Supabase Auth', () => {
        expect(correosDeFicha('Info@Empresa.COM')).toEqual(['info@empresa.com']);
    });

    it('descarta lo que no es un correo', () => {
        expect(correosDeFicha('no tiene correo')).toEqual([]);
        expect(correosDeFicha('')).toEqual([]);
        expect(correosDeFicha(null)).toEqual([]);
        expect(correosDeFicha(undefined)).toEqual([]);
        expect(correosDeFicha('sin correo ; pedidos@empresa.com')).toEqual(['pedidos@empresa.com']);
    });

    it('el separador de sobra no deja huecos vacíos', () => {
        expect(correosDeFicha('uno@x.com ;; dos@x.com ;')).toEqual(['uno@x.com', 'dos@x.com']);
    });
});

describe('primerCorreoDeFicha', () => {
    it('de una lista, la primera dirección', () => {
        expect(primerCorreoDeFicha('marc.mora@cm93.com ; rosario.yebras@cm93.com')).toBe('marc.mora@cm93.com');
    });

    it('de un correo suelto, ese mismo', () => {
        expect(primerCorreoDeFicha('cliente@empresa.com')).toBe('cliente@empresa.com');
    });

    it('sin correo reconocible devuelve vacío, no la nota escrita', () => {
        // Importa: esto acaba en create-auth-user. Preferimos quedarnos sin
        // cuenta a intentar crear una con "pendiente de pedirlo" de correo.
        expect(primerCorreoDeFicha('pendiente de pedirlo')).toBe('');
        expect(primerCorreoDeFicha('')).toBe('');
    });
});
