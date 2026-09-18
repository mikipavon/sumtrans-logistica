import { describe, it, expect } from 'vitest';
import { normalizarCamposIA, albaranesPorFotoDelMes, nivelDeSaldo } from './lecturaAlbaranIA';

describe('normalizarCamposIA', () => {
    it('deja tal cual una lectura buena (la de Gemini con la foto real de TSB)', () => {
        const r = normalizarCamposIA({
            giro: 90, expedicion: '999423323648', remitente: 'AKZO NOBEL INDUSTRIAL PAINTS, S.L.',
            destinatario: 'CARPINTERÍA FERAN HERM.ROMERO', direccion: 'C/PINTOR ZURBARÁN, 32.',
            poblacion: 'FERNAN NUÑEZ', cp: '14520', telefono: '', bultos: 1, kilos: 5, porte: 'Pagado', reembolso: 0,
        });
        expect(r).toEqual({
            expedicion: '999423323648', remitente: 'AKZO NOBEL INDUSTRIAL PAINTS, S.L.',
            destinatario: 'CARPINTERÍA FERAN HERM.ROMERO', direccion: 'C/PINTOR ZURBARÁN, 32.',
            poblacion: 'FERNAN NUÑEZ', cp: '14520', telefono: '', bultos: 1, kilos: 5, porte: 'Pagado', reembolso: 0,
        });
    });

    it('arregla la forma: números como texto, espacios, porte en plural y mayúsculas', () => {
        const r = normalizarCamposIA({ cp: ' 14500 ', bultos: '3', kilos: '12,5', porte: 'PORTES DEBIDOS', reembolso: '125,40 €', expedicion: 12345 });
        expect(r.cp).toBe('14500');
        expect(r.bultos).toBe(3);
        expect(r.kilos).toBe(12.5);
        expect(r.porte).toBe('Debido');
        expect(r.reembolso).toBe(125.4);
        expect(r.expedicion).toBe('12345');
    });

    it('quita el prefijo 34 del teléfono y descarta lo que no es un teléfono español', () => {
        expect(normalizarCamposIA({ telefono: '+34 636 70 97 83' }).telefono).toBe('636709783');
        expect(normalizarCamposIA({ telefono: '957 20 45 65' }).telefono).toBe('957204565');
        // Un código de cliente de la agencia leído como teléfono (Gemma lo hizo con "Cod. 99999999-14").
        expect(normalizarCamposIA({ telefono: '95799999914' }).telefono).toBe('');
        expect(normalizarCamposIA({ telefono: '12345' }).telefono).toBe('');
    });

    it('un CP que no son 5 cifras se queda vacío para que la oficina lo mire', () => {
        expect(normalizarCamposIA({ cp: '1452' }).cp).toBe('');
        expect(normalizarCamposIA({ cp: '14520 FERNAN NUÑEZ' }).cp).toBe('14520');
    });

    it('bultos cero o negativos, o kilos cero, cuentan como no leídos', () => {
        const r = normalizarCamposIA({ bultos: 0, kilos: 0, reembolso: -3 });
        expect(r.bultos).toBeNull();
        expect(r.kilos).toBeNull();
        expect(r.reembolso).toBe(0);
    });

    it('un porte que no dice pagado ni debido se queda sin elegir', () => {
        expect(normalizarCamposIA({ porte: 'no se ve' }).porte).toBe('');
    });

    it('con una respuesta vacía o nula devuelve todos los campos vacíos sin fallar', () => {
        const r = normalizarCamposIA(null);
        expect(r.destinatario).toBe('');
        expect(r.bultos).toBeNull();
        expect(r.reembolso).toBe(0);
        expect(normalizarCamposIA({ destinatario: null, poblacion: undefined }).destinatario).toBe('');
    });
});

describe('albaranesPorFotoDelMes', () => {
    const hoy = new Date('2026-09-18T12:00:00');
    it('cuenta sólo los creados por la importación de fotos en el mes en curso', () => {
        const envios = [
            { createdBy: 'Admin (Import Fotos: TSB)', createdAt: '2026-09-02T10:00:00Z' },
            { createdBy: 'Admin (Import Fotos: TSB)', createdAt: '2026-09-17T10:00:00Z' },
            { createdBy: 'Admin (Import Fotos: TSB)', createdAt: '2026-08-31T10:00:00Z' },
            { createdBy: 'Admin (Import: TSB)', createdAt: '2026-09-10T10:00:00Z' },
            { createdBy: 'Admin', createdAt: '2026-09-10T10:00:00Z' },
            { createdBy: 'Admin (Import Fotos: TSB)', createdAt: 'sin fecha' },
        ];
        expect(albaranesPorFotoDelMes(envios, hoy)).toBe(2);
    });

    it('sin envíos da 0', () => {
        expect(albaranesPorFotoDelMes(undefined, hoy)).toBe(0);
    });
});

describe('nivelDeSaldo', () => {
    it('rojo por debajo de 1, naranja por debajo de 3, verde el resto', () => {
        expect(nivelDeSaldo(0.4)).toBe('rojo');
        expect(nivelDeSaldo(2.5)).toBe('naranja');
        expect(nivelDeSaldo(9.99)).toBe('verde');
        expect(nivelDeSaldo(null)).toBe('desconocido');
    });
});
