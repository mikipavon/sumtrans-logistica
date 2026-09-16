import { describe, it, expect } from 'vitest';
import { ahoraParaInputLocal, conHoraRapida, HORAS_RAPIDAS_DE_ASIGNACION } from './horaDeAsignacion';

describe('ahoraParaInputLocal', () => {
    it('devuelve la hora local con el formato del input', () => {
        expect(ahoraParaInputLocal(new Date(2026, 8, 15, 19, 35))).toBe('2026-09-15T19:35');
    });

    it('rellena con cero día, mes, hora y minuto de una cifra', () => {
        expect(ahoraParaInputLocal(new Date(2026, 0, 3, 8, 5))).toBe('2026-01-03T08:05');
    });

    it('usa la fecha local, no la UTC', () => {
        // A las 23:30 del 15 en Madrid en verano ya es día 16 en UTC.
        expect(ahoraParaInputLocal(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15T23:30');
    });
});

describe('conHoraRapida', () => {
    it('cambia la hora y respeta el día que ya había en el campo', () => {
        expect(conHoraRapida('2026-09-20T09:15', '14:00')).toBe('2026-09-20T14:00');
    });

    it('pone la hora sobre hoy si el campo está vacío', () => {
        expect(conHoraRapida('', '19:00', new Date(2026, 8, 15, 10, 0))).toBe('2026-09-15T19:00');
        expect(conHoraRapida(undefined, '19:00', new Date(2026, 8, 15, 10, 0))).toBe('2026-09-15T19:00');
    });

    it('ofrece las dos y las siete', () => {
        expect(HORAS_RAPIDAS_DE_ASIGNACION).toEqual(['14:00', '19:00']);
    });
});
