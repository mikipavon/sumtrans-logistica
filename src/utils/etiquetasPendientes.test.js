import { describe, it, expect } from 'vitest';
import { enviosPendientesDeEtiqueta, etiquetasImpresas } from './etiquetasPendientes';

// El botón del portal saca sólo las etiquetas que faltan: las del día, de lo
// que el cliente manda, que no se hayan impreso ya y que todavía no hayamos
// recogido. Así por la tarde no le vuelven a salir las de la mañana.

const ESMEBRA = { id: 42, name: 'ESMEBRA' };
const hoy = new Date(2026, 8, 24, 16, 0);

const base = {
    clientId: 42, client: 'ESMEBRA', originName: 'ESMEBRA',
    destinationName: 'FERRETERIA PEPE', destinationCity: 'Mijas', packages: 2,
    status: 'Pendiente de asignar',
};
const deLaManana   = { ...base, id: 'SUM-600', createdAt: '2026-09-24T07:30:00.000Z', labelsPrintedAt: '2026-09-24T07:35:00.000Z' };
const recogido     = { ...base, id: 'SUM-601', createdAt: '2026-09-24T08:00:00.000Z', scannedPackages: [1] };
const enReparto    = { ...base, id: 'SUM-602', createdAt: '2026-09-24T08:10:00.000Z', status: 'En reparto' };
const deLaTarde    = { ...base, id: 'SUM-603', createdAt: '2026-09-24T13:00:00.000Z' };
const deLaTardeMas = { ...base, id: 'SUM-604', createdAt: '2026-09-24T13:20:00.000Z' };
const deAyer       = { ...base, id: 'SUM-590', createdAt: '2026-09-23T13:00:00.000Z' };
const anulado      = { ...base, id: 'SUM-605', createdAt: '2026-09-24T13:30:00.000Z', status: 'Anulado' };
const recibido     = { ...base, id: 'SUM-606', createdAt: '2026-09-24T13:40:00.000Z', clientId: 7, client: 'OTRO', originName: 'OTRO', destinationName: 'ESMEBRA' };

const todos = [deLaManana, recogido, enReparto, deLaTarde, deLaTardeMas, deAyer, anulado, recibido];

describe('enviosPendientesDeEtiqueta', () => {
    it('por la tarde sólo salen los nuevos: ni los ya impresos, ni los recogidos, ni los que están en marcha', () => {
        const ids = enviosPendientesDeEtiqueta(todos, ESMEBRA, { hoy }).map(s => s.id);
        expect(ids).toEqual(['SUM-603', 'SUM-604']);
    });

    it('sin fechas puestas no entra lo de ayer; con fechas, sí, y sigue sin entrar lo ya impreso', () => {
        const sinFechas = enviosPendientesDeEtiqueta([deAyer, deLaTarde], ESMEBRA, { hoy }).map(s => s.id);
        expect(sinFechas).toEqual(['SUM-603']);
        const conFechas = enviosPendientesDeEtiqueta([deAyer, deLaManana, deLaTarde], ESMEBRA, { hoy, hayFiltroDeFechas: true }).map(s => s.id);
        expect(conFechas).toEqual(['SUM-590', 'SUM-603']);
    });

    it('lo anulado y lo que le llega de otros nunca lleva etiqueta suya', () => {
        expect(enviosPendientesDeEtiqueta([anulado, recibido], ESMEBRA, { hoy })).toEqual([]);
    });

    it('etiquetasImpresas mira la marca del envío', () => {
        expect(etiquetasImpresas(deLaManana)).toBe(true);
        expect(etiquetasImpresas(deLaTarde)).toBe(false);
        expect(etiquetasImpresas(null)).toBe(false);
    });
});
