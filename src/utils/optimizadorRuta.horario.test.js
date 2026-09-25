import { describe, it, expect } from 'vitest';
import { optimizarRuta } from './optimizadorRuta';
import { registrarCerrado } from './aprendizajeHorario';

// Regla 7 del optimizador: a quien no abre todavía no se le manda a nadie.
// Mismos utensilios que optimizadorRuta.test.js: la base en Cabra, y paradas a tantos
// kilómetros al norte.
const BASE_LAT = 37.4700;
const BASE_LON = -4.4400;
const norte = (km) => BASE_LAT + km * 0.009009;
const punto = (kmNorte) => `${norte(kmNorte)},${BASE_LON}`;

let contador = 0;
const envio = ({ nombre, coords, ciudad = 'Cabra' }) => {
    contador++;
    return {
        id: `e${contador}`,
        type: 'Entrega',
        client: nombre,
        destinationName: nombre,
        destinationCity: ciudad,
        destinationCoordinates: coords,
        destinationAddress: `Calle ${contador}`,
        agencyLabel: 'SUM ESPECIAL',
    };
};

const alas = (h, m = 0) => new Date(2026, 8, 23, h, m, 0);
const GPS = { lat: BASE_LAT, lon: BASE_LON };
const nombres = (r) => r.orden.map(e => e.destinationName);

const conFichas = (fichas) => (e) => fichas[e.destinationName] || null;

describe('regla 7: no mandar a nadie antes de que abran', () => {
    it('sin horas no cambia nada', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'C', coords: punto(3) })];
        const r = optimizarRuta({ envios, gps: GPS, ahora: alas(9) });
        expect(nombres(r)).toEqual(['A', 'B', 'C']);
        expect(r.aplazadas.size).toBe(0);
        expect(r.resumen.aplazadas).toBe(0);
    });

    it('la ficha con "no antes de" manda la parada al final si no da tiempo a que abra', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'C', coords: punto(3) })];
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9),
            resolverCliente: conFichas({ B: { name: 'B', noAntesDe: '10:30' } }),
        });
        expect(nombres(r)).toEqual(['A', 'C', 'B']);
        expect(r.aplazadas.get(envios[1].id)).toBe(10 * 60 + 30);
        expect(r.resumen.aplazadas).toBe(1);
    });

    it('si ya es tarde no aplaza nada', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'C', coords: punto(3) })];
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(11),
            resolverCliente: conFichas({ B: { name: 'B', noAntesDe: '10:30' } }),
        });
        expect(nombres(r)).toEqual(['A', 'B', 'C']);
        expect(r.aplazadas.size).toBe(0);
    });

    it('llegar unos minutos antes de la hora se da por bueno', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) })];
        // A B se llega sobre las 9:07; abrir a las 9:15 es esperar un momento.
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9),
            resolverCliente: conFichas({ B: { name: 'B', noAntesDe: '09:15' } }),
        });
        expect(nombres(r)).toEqual(['A', 'B']);
        expect(r.aplazadas.size).toBe(0);
    });

    it('cuando el reloj llega a su hora, se mete donde menos desvía', () => {
        // A a 1 km, B a 2 km, D a 30 km (unos 45 minutos de camino).
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'D', coords: punto(30) })];
        // Aprendido: a las 9:30 estaba cerrado → no antes de las 9:50.
        const aprendizaje = registrarCerrado(null, { cliente: 'B', fecha: alas(9, 30) });
        const r = optimizarRuta({ envios, gps: GPS, ahora: alas(9), aprendizaje });
        // A D se llega pasadas las 9:45: B cabe justo antes, que además le pilla de paso.
        expect(nombres(r)).toEqual(['A', 'B', 'D']);
        expect(r.aplazadas.has(envios[1].id)).toBe(true);
    });

    it('lo que sabe otro repartidor del mismo cliente también vale', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'C', coords: punto(3) })];
        const deOtro = registrarCerrado(null, { cliente: 'B', fecha: alas(10, 30) });
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9),
            conductorId: 'yo',
            conocimiento: { byDriver: { otro: deOtro } },
        });
        expect(nombres(r)).toEqual(['A', 'C', 'B']);
    });

    it('la hora de la ficha manda sobre la aprendida', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: punto(2) }), envio({ nombre: 'C', coords: punto(3) })];
        const aprendizaje = registrarCerrado(null, { cliente: 'B', fecha: alas(10, 30) });
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9), aprendizaje,
            resolverCliente: conFichas({ B: { name: 'B', noAntesDe: '08:00' } }),
        });
        expect(nombres(r)).toEqual(['A', 'B', 'C']);
        expect(r.aplazadas.size).toBe(0);
    });

    it('varias aplazadas salen por orden de hora de apertura', () => {
        const envios = [
            envio({ nombre: 'A', coords: punto(1) }),
            envio({ nombre: 'B', coords: punto(2) }),
            envio({ nombre: 'C', coords: punto(3) }),
        ];
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9),
            resolverCliente: conFichas({
                A: { name: 'A', noAntesDe: '12:00' },
                B: { name: 'B', noAntesDe: '11:00' },
            }),
        });
        expect(nombres(r)).toEqual(['C', 'B', 'A']);
    });

    it('una parada sin coordenadas ni pueblo situado también se aplaza', () => {
        const envios = [envio({ nombre: 'A', coords: punto(1) }), envio({ nombre: 'B', coords: null }), envio({ nombre: 'C', coords: punto(3) })];
        const r = optimizarRuta({
            envios, gps: GPS, ahora: alas(9),
            resolverCliente: conFichas({ B: { name: 'B', noAntesDe: '10:30' } }),
        });
        expect(nombres(r)[2]).toBe('B');
        expect(r.aplazadas.has(envios[1].id)).toBe(true);
    });
});
