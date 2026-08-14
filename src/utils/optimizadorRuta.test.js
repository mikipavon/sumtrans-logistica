import { describe, it, expect } from 'vitest';
import { optimizarRuta, pueblosDelTurno, elegirRuta, distanciaKm } from './optimizadorRuta';

// ── Utilidades para montar escenarios ──────────────────────────────────────────
// 1 km al norte ≈ 0.009009 grados de latitud.
// 1 km al este a la altura de Cabra ≈ 0.011320 grados de longitud.
const BASE_LAT = 37.4700;
const BASE_LON = -4.4400;
const norte = (km) => BASE_LAT + km * 0.009009;
const este = (km) => BASE_LON + km * 0.011320;

/** Coordenadas a `kmNorte` y `kmEste` de la base, en el formato "lat,lon". */
const punto = (kmNorte, kmEste = 0) => `${norte(kmNorte)},${este(kmEste)}`;

let contador = 0;
const envio = ({ ciudad = 'Cabra', coords = null, agencia = false, nombre = null, tipo = 'Entrega', ...resto } = {}) => {
    contador++;
    const nom = nombre || `cliente${contador}`;
    return {
        id: `e${contador}`,
        type: tipo,
        client: nom,
        destinationName: nom,
        destinationCity: ciudad,
        destinationCoordinates: coords,
        destinationAddress: `Calle ${contador}`,
        agencyLabel: agencia ? 'tsb' : 'SUM ESPECIAL',
        ...resto,
    };
};

const alas = (h, m = 0) => new Date(2026, 6, 30, h, m, 0);
const MANANA = alas(10);
const TARDE = alas(16);

const nombres = (resultado) => resultado.orden.map(e => e.destinationName);
const pueblos = (resultado) => resultado.orden.map(e => e.destinationCity);

const memoriaFirme = (pueblo, turno, ordenes) => ({
    _v: 2,
    [pueblo]: {
        [turno]: Object.fromEntries(
            Object.entries(ordenes).map(([cliente, orden]) => [cliente, { orden, count: 10 }])
        ),
    },
});

// ── Piezas sueltas ────────────────────────────────────────────────────────────

describe('pueblosDelTurno', () => {
    const ruta = {
        poblacionesManana: ['Lucena', 'Cabra'],
        poblacionesTarde: ['Rute', 'Iznájar'],
    };

    it('primero los del turno que se reparte y después los del otro', () => {
        expect(pueblosDelTurno(ruta, 'manana')).toEqual(['Lucena', 'Cabra', 'Rute', 'Iznájar']);
        expect(pueblosDelTurno(ruta, 'tarde')).toEqual(['Rute', 'Iznájar', 'Lucena', 'Cabra']);
    });

    // El Gestor de Rutas permite a propósito poner un pueblo en los dos turnos.
    it('un pueblo en los dos turnos sale una sola vez, donde le toca ahora', () => {
        const dosTurnos = {
            poblacionesManana: ['Lucena', 'Cabra'],
            poblacionesTarde: ['Lucena'],
        };
        expect(pueblosDelTurno(dosTurnos, 'manana')).toEqual(['Lucena', 'Cabra']);
        expect(pueblosDelTurno(dosTurnos, 'tarde')).toEqual(['Lucena', 'Cabra']);
    });

    it('deduplica aunque esté escrito de otra manera', () => {
        const raro = {
            poblacionesManana: ['Montalbán de Córdoba'],
            poblacionesTarde: ['MONTALBAN DE CORDOBA'],
        };
        expect(pueblosDelTurno(raro, 'manana')).toEqual(['Montalbán de Córdoba']);
    });

    it('aguanta el campo antiguo y las rutas vacías', () => {
        expect(pueblosDelTurno({ poblaciones: ['Cabra'] }, 'manana')).toEqual(['Cabra']);
        expect(pueblosDelTurno(null, 'manana')).toEqual([]);
        expect(pueblosDelTurno({}, 'tarde')).toEqual([]);
    });
});

describe('elegirRuta', () => {
    const rutas = [
        { id: 'r1', conductorId: 7, poblacionesManana: ['Lucena'] },
        { id: 'r2', conductorId: null, poblacionesManana: ['Rute'] },
    ];

    it('la del conductor, comparando ids como texto', () => {
        expect(elegirRuta(rutas, '7')?.id).toBe('r1');
        expect(elegirRuta(rutas, 7)?.id).toBe('r1');
    });

    it('si no hay ninguna suya, la que diga su ficha', () => {
        expect(elegirRuta(rutas, 99, 'r2')?.id).toBe('r2');
    });

    // Antes se caía a DEFAULT_RUTAS, que no tienen conductor: le daba a un conductor
    // los pueblos de otro.
    it('sin ruta suya y sin ficha, ninguna', () => {
        expect(elegirRuta(rutas, 99)).toBeNull();
        expect(elegirRuta([], 7)).toBeNull();
        expect(elegirRuta(null, 7)).toBeNull();
    });

    // El día que un conductor cubre a otro se le asigna la ruta del que falta y se
    // queda con dos. Antes ganaba la primera del array —la suya de siempre— y el
    // reparto de hoy salía entero "fuera de ruta", colocado por geografía.
    describe('cuando cubre la ruta de otro y tiene dos', () => {
        const dos = [
            { id: 'suya', conductorId: 7, nombre: 'La de Antonio', poblacionesManana: ['Lucena', 'Cabra'] },
            { id: 'cubre', conductorId: 7, nombre: 'La del que falta', poblacionesManana: ['Rute', 'Iznájar'] },
        ];

        it('gana la que cubre los pueblos que hay que repartir hoy', () => {
            expect(elegirRuta(dos, 7, null, ['Rute', 'Iznájar', 'Iznájar'])?.id).toBe('cubre');
            expect(elegirRuta(dos, 7, null, ['Lucena', 'Cabra'])?.id).toBe('suya');
        });

        it('sin pueblos con los que decidir, se queda la primera de siempre', () => {
            expect(elegirRuta(dos, 7)?.id).toBe('suya');
            expect(elegirRuta(dos, 7, null, [])?.id).toBe('suya');
        });

        it('también entra en la comparación la ruta que diga su ficha', () => {
            const mixtas = [
                { id: 'suya', conductorId: 7, poblacionesManana: ['Lucena'] },
                { id: 'ficha', conductorId: null, poblacionesManana: ['Rute', 'Iznájar'] },
            ];
            expect(elegirRuta(mixtas, 7, 'ficha', ['Rute', 'Iznájar'])?.id).toBe('ficha');
            expect(elegirRuta(mixtas, 7, 'ficha', ['Lucena'])?.id).toBe('suya');
        });
    });
});

// ── Regla 1: el turno decide el orden de los pueblos ──────────────────────────

describe('el turno ordena los pueblos', () => {
    const rutas = [{
        id: 'r1', conductorId: 7,
        poblacionesManana: ['Lucena'],
        poblacionesTarde: ['Cabra'],
    }];

    const hacerEnvios = () => {
        contador = 0;
        return [
            envio({ ciudad: 'Cabra', coords: punto(0), nombre: 'cabra1' }),
            envio({ ciudad: 'Lucena', coords: punto(20), nombre: 'lucena1' }),
        ];
    };

    it('por la mañana, primero los pueblos de mañana', () => {
        const r = optimizarRuta({ envios: hacerEnvios(), rutas, conductorId: 7, ahora: MANANA });
        expect(nombres(r)).toEqual(['lucena1', 'cabra1']);
        expect(r.resumen.turno).toBe('manana');
    });

    it('por la tarde se da la vuelta', () => {
        const r = optimizarRuta({ envios: hacerEnvios(), rutas, conductorId: 7, ahora: TARDE });
        expect(nombres(r)).toEqual(['cabra1', 'lucena1']);
        expect(r.resumen.turno).toBe('tarde');
    });

    it('los pueblos del otro turno no se pierden, van detrás', () => {
        const r = optimizarRuta({ envios: hacerEnvios(), rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden).toHaveLength(2);
    });
});

// ── El suplente que cubre la ruta de otro ─────────────────────────────────────
// Falta el conductor habitual, se le pasan sus pueblos a Antonio y Antonio se queda
// con dos rutas. La ruta buena es la que tiene los pueblos que hoy hay que repartir.

describe('un conductor con dos rutas asignadas', () => {
    const rutas = [
        { id: 'suya', conductorId: 7, nombre: 'Antonio de siempre', poblacionesManana: ['Lucena', 'Cabra'] },
        { id: 'cubre', conductorId: 7, nombre: 'La del que falta', poblacionesManana: ['Rute', 'Iznájar'] },
    ];

    const enviosDeHoy = () => {
        contador = 0;
        return [
            // A propósito en el orden equivocado y con Iznájar más cerca del centro:
            // si mandara la geografía saldría Iznájar primero, como en el móvil.
            envio({ ciudad: 'Iznájar', coords: punto(2), nombre: 'iznajar1' }),
            envio({ ciudad: 'Iznájar', coords: punto(3), nombre: 'iznajar2' }),
            envio({ ciudad: 'Rute', coords: punto(12), nombre: 'rute1' }),
        ];
    };

    it('ordena con la ruta que se está haciendo hoy, no con la suya de siempre', () => {
        const r = optimizarRuta({ envios: enviosDeHoy(), rutas, conductorId: 7, ahora: MANANA });
        expect(pueblos(r)).toEqual(['Rute', 'Iznájar', 'Iznájar']);
        expect(r.resumen.ruta).toBe('La del que falta');
        expect(r.resumen.extras).toBe(0);   // ningún envío se queda fuera de ruta
        expect(r.resumen.sinRuta).toBe(false);
    });

    it('con la ruta equivocada sale justo lo que se quejaba el transportista', () => {
        // Mismo escenario, pero con la ruta que no toca: los envíos de hoy quedan
        // todos fuera de ella y los coloca la geografía, que mete primero Iznájar
        // (más cerca del centro del día) y obliga a volver luego a Rute.
        const soloLaSuya = [rutas[0]];
        const r = optimizarRuta({ envios: enviosDeHoy(), rutas: soloLaSuya, conductorId: 7, ahora: MANANA });
        expect(r.resumen.extras).toBe(3);
        expect(pueblos(r)).toEqual(['Iznájar', 'Iznájar', 'Rute']);
    });
});

describe('un pueblo en los dos turnos no duplica paradas', () => {
    it('cada envío sale una sola vez', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Lucena', coords: punto(0), nombre: 'lucena1' }),
            envio({ ciudad: 'Lucena', coords: punto(1), nombre: 'lucena2' }),
            envio({ ciudad: 'Cabra', coords: punto(20), nombre: 'cabra1' }),
        ];
        const rutas = [{
            id: 'r1', conductorId: 7,
            poblacionesManana: ['Lucena', 'Cabra'],
            poblacionesTarde: ['Lucena'],
        }];
        const r = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden).toHaveLength(3);
        expect(new Set(r.orden.map(e => e.id)).size).toBe(3);
    });
});

// ── Regla 2 y 3: nuestros primero, salvo que la agencia esté de camino ────────

describe('nuestros antes que las agencias', () => {
    const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];

    it('la agencia espera aunque esté más cerca, si desviarse cuesta', () => {
        contador = 0;
        const envios = [
            envio({ coords: punto(0), agencia: true, nombre: 'agencia_pegada' }),
            envio({ coords: punto(5), nombre: 'nuestro_lejos' }),
        ];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['nuestro_lejos', 'agencia_pegada']);
        expect(r.deCamino.size).toBe(0);
    });

    it('pero si pasamos por la puerta, se entrega al pasar', () => {
        contador = 0;
        const nuestroCerca = envio({ coords: punto(0), nombre: 'nuestro_cerca' });
        const agenciaDeCamino = envio({ coords: punto(0.15), agencia: true, nombre: 'agencia_de_camino' });
        const nuestroLejos = envio({ coords: punto(5), nombre: 'nuestro_lejos' });

        const r = optimizarRuta({
            envios: [nuestroCerca, agenciaDeCamino, nuestroLejos],
            rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['nuestro_cerca', 'agencia_de_camino', 'nuestro_lejos']);
        expect([...r.deCamino]).toEqual([agenciaDeCamino.id]);
    });

    it('marca las que ha colado, para que el transportista lo vea', () => {
        contador = 0;
        const agencia = envio({ coords: punto(0.2), agencia: true, nombre: 'ag' });
        const r = optimizarRuta({
            envios: [envio({ coords: punto(0), nombre: 'n1' }), agencia, envio({ coords: punto(4), nombre: 'n2' })],
            rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(r.deCamino.has(agencia.id)).toBe(true);
        expect(r.resumen.deCamino).toBe(1);
    });

    // Encadenando saltos cortos se acababa lejísimos del hilo de los urgentes.
    it('no encadena: la distancia se mide siempre desde la parada actual', () => {
        contador = 0;
        const nuestroA = envio({ coords: punto(0), nombre: 'nuestro_a' });
        const nuestroE = envio({ coords: punto(0, 3.5), nombre: 'nuestro_e' });
        const ag1 = envio({ coords: punto(0.5), agencia: true, nombre: 'ag_500m' });
        const ag2 = envio({ coords: punto(1.4), agencia: true, nombre: 'ag_1400m' });
        const ag3 = envio({ coords: punto(2.3), agencia: true, nombre: 'ag_2300m' });

        const r = optimizarRuta({
            envios: [nuestroA, nuestroE, ag1, ag2, ag3],
            rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });

        // Solo se cuela la que está a 500 m. Las de 1,4 y 2,3 km se quedan detrás
        // de los nuestros: si se midiera desde la arrastrada, entrarían las tres.
        expect([...r.deCamino]).toEqual([ag1.id]);
        expect(nombres(r)).toEqual(['nuestro_a', 'ag_500m', 'nuestro_e', 'ag_1400m', 'ag_2300m']);
    });

    it('no arrastra lo que queda detrás, en dirección contraria a la marcha', () => {
        contador = 0;
        const salida = envio({ coords: punto(0), nombre: 'salida' });
        const detras = envio({ coords: punto(-0.8), agencia: true, nombre: 'agencia_detras' });
        const rumbo = envio({ coords: punto(6), nombre: 'rumbo' });

        const r = optimizarRuta({
            envios: [salida, detras, rumbo],
            rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        // Está a 800 m (dentro del radio) pero ir y volver cuesta 1,6 km.
        expect(r.deCamino.size).toBe(0);
        expect(nombres(r)).toEqual(['salida', 'rumbo', 'agencia_detras']);
    });

    it('la prioridad "normal" del cliente ya no manda al bloque de agencias', () => {
        contador = 0;
        const nuestroNormal = envio({ coords: punto(0), nombre: 'nuestro_normal' });
        const agencia = envio({ coords: punto(6), agencia: true, nombre: 'agencia' });
        const r = optimizarRuta({
            envios: [agencia, nuestroNormal],
            rutas, conductorId: 7, ahora: MANANA,
            resolverCliente: (e) => e.destinationName === 'nuestro_normal'
                ? { name: 'nuestro_normal', priority: 'normal' }
                : null,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['nuestro_normal', 'agencia']);
    });
});

// ── Regla 4: aprender del transportista ──────────────────────────────────────

describe('aprendizaje del transportista', () => {
    const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];
    const tresParadas = () => {
        contador = 0;
        return [
            envio({ coords: punto(0), nombre: 'x' }),
            envio({ coords: punto(1.5), nombre: 'y' }),
            envio({ coords: punto(3), nombre: 'z' }),
        ];
    };
    const gps = { lat: norte(0), lon: este(0) };

    it('sin historial manda la geografía', () => {
        const r = optimizarRuta({ envios: tresParadas(), rutas, conductorId: 7, ahora: MANANA, gps });
        expect(nombres(r)).toEqual(['x', 'y', 'z']);
    });

    it('con historial firme manda el orden que confirma el transportista', () => {
        const r = optimizarRuta({
            envios: tresParadas(), rutas, conductorId: 7, ahora: MANANA, gps,
            aprendizaje: memoriaFirme('cabra', 'manana', { z: 0, y: 0.5, x: 1 }),
        });
        expect(nombres(r)).toEqual(['z', 'y', 'x']);
    });

    it('con historial flojo no se atreve a darle la vuelta a la geografía', () => {
        const flojo = {
            _v: 2,
            cabra: { manana: { z: { orden: 0, count: 1 }, y: { orden: 0.5, count: 1 }, x: { orden: 1, count: 1 } } },
        };
        const r = optimizarRuta({
            envios: tresParadas(), rutas, conductorId: 7, ahora: MANANA, gps,
            aprendizaje: flojo,
        });
        expect(nombres(r)).toEqual(['x', 'y', 'z']);
    });

    it('los clientes nuevos se colocan donde menos desvían el orden aprendido', () => {
        contador = 0;
        const envios = [
            envio({ coords: punto(0), nombre: 'x' }),
            envio({ coords: punto(3), nombre: 'z' }),
            envio({ coords: punto(1.5), nombre: 'nuevo' }),
        ];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA, gps,
            aprendizaje: memoriaFirme('cabra', 'manana', { z: 0, x: 1 }),
        });
        // Aprendido: z antes que x. El nuevo está justo entre los dos.
        expect(nombres(r)).toEqual(['z', 'nuevo', 'x']);
    });

    it('el historial de mañana no se aplica por la tarde si la tarde tiene el suyo', () => {
        const dosTurnos = {
            _v: 2,
            cabra: {
                manana: { x: { orden: 0, count: 10 }, y: { orden: 0.5, count: 10 }, z: { orden: 1, count: 10 } },
                tarde: { z: { orden: 0, count: 10 }, y: { orden: 0.5, count: 10 }, x: { orden: 1, count: 10 } },
            },
        };
        const rutasTarde = [{ id: 'r1', conductorId: 7, poblacionesTarde: ['Cabra'] }];
        const manana = optimizarRuta({
            envios: tresParadas(), rutas: rutasTarde, conductorId: 7, ahora: MANANA, gps, aprendizaje: dosTurnos,
        });
        const tarde = optimizarRuta({
            envios: tresParadas(), rutas: rutasTarde, conductorId: 7, ahora: TARDE, gps, aprendizaje: dosTurnos,
        });
        expect(nombres(manana)).toEqual(['x', 'y', 'z']);
        expect(nombres(tarde)).toEqual(['z', 'y', 'x']);
    });

    it('hereda del maestro de SU ruta antes que del de otra', () => {
        const conocimiento = {
            masterByRoute: {
                r_otra: { _v: 2, cabra: { manana: { x: { orden: 0, count: 10 }, y: { orden: 0.5, count: 10 }, z: { orden: 1, count: 10 } } } },
                r1: { _v: 2, cabra: { manana: { z: { orden: 0, count: 10 }, y: { orden: 0.5, count: 10 }, x: { orden: 1, count: 10 } } } },
            },
        };
        const r = optimizarRuta({
            envios: tresParadas(), rutas, conductorId: 7, ahora: MANANA, gps, conocimiento,
        });
        expect(nombres(r)).toEqual(['z', 'y', 'x']);
    });

    it('aplica el aprendizaje viejo, con la ciudad escrita a la antigua', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'MONTALBÁN DE CÓRDOBA (14548)', coords: punto(0), nombre: 'x' }),
            envio({ ciudad: 'MONTALBÁN DE CÓRDOBA (14548)', coords: punto(3), nombre: 'z' }),
        ];
        const rutasMontalban = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Montalbán de Córdoba'] }];
        // Formato v1: posición absoluta y clave con código postal.
        const viejo = {
            'montalbán de córdoba (14548)': {
                z: { avg: 1.1, count: 12 },
                x: { avg: 2.8, count: 12 },
            },
        };
        const r = optimizarRuta({
            envios, rutas: rutasMontalban, conductorId: 7, ahora: MANANA, gps, aprendizaje: viejo,
        });
        expect(nombres(r)).toEqual(['z', 'x']);
    });
});

// ── La coordenada de la SEDE manda sobre la del cliente padre ─────────────────
// Dos sedes del mismo cliente (p.ej. "Agrocor Torre" y "Agrocor Quemadas") con la
// ficha principal con coordenadas propias: sin esto, el optimizador las trataba
// como si estuvieran en el mismo sitio y el orden dejaba de tener que ver con la
// distancia real entre ellas.

describe('coordenadas de sede vs cliente padre', () => {
    const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Córdoba'] }];
    const gps = { lat: norte(0), lon: este(0) };

    it('usa la coordenada de la sede, no la de la ficha principal', () => {
        contador = 0;
        // A propósito en el orden equivocado: si mandara la ficha principal
        // (mismo punto para las dos) ganaría el orden de entrada, no la distancia.
        const quemadas = envio({ ciudad: 'Córdoba', coords: punto(5), nombre: 'Agrocor Quemadas' });
        const torre = envio({ ciudad: 'Córdoba', coords: punto(1), nombre: 'Agrocor Torre' });

        const fichaPrincipal = { name: 'Agrocor', coordinates: punto(10) };
        const resolverCliente = (e) => {
            if (e.destinationName === 'Agrocor Quemadas') {
                return { ...fichaPrincipal, _isBranch: true, _branch: { name: 'Agrocor Quemadas', coordinates: punto(5) } };
            }
            if (e.destinationName === 'Agrocor Torre') {
                return { ...fichaPrincipal, _isBranch: true, _branch: { name: 'Agrocor Torre', coordinates: punto(1) } };
            }
            return null;
        };

        const r = optimizarRuta({
            envios: [quemadas, torre], rutas, conductorId: 7, ahora: MANANA, gps, resolverCliente,
        });
        // Torre está a 1 km del punto de partida, Quemadas a 5 km: Torre va primero.
        expect(nombres(r)).toEqual(['Agrocor Torre', 'Agrocor Quemadas']);
    });

    it('sin coordenada propia en la sede, cae a la de la ficha principal', () => {
        contador = 0;
        // La sede no tiene coordenada propia (fondo, punto(9)): sin la ficha
        // principal (punto(1), cerca) caería a las del ALBARÁN, que la dejarían
        // la última. Con el fallback a la ficha principal, va primero.
        const sedeSinCoords = envio({ ciudad: 'Córdoba', coords: punto(9), nombre: 'Agrocor Quemadas' });
        const otra = envio({ ciudad: 'Córdoba', coords: punto(4), nombre: 'otra' });
        const resolverCliente = (e) => {
            if (e.destinationName === 'Agrocor Quemadas') {
                return { name: 'Agrocor', coordinates: punto(1), _isBranch: true, _branch: { name: 'Agrocor Quemadas', coordinates: '' } };
            }
            return null;
        };
        const r = optimizarRuta({
            envios: [sedeSinCoords, otra], rutas, conductorId: 7, ahora: MANANA, gps, resolverCliente,
        });
        expect(nombres(r)).toEqual(['Agrocor Quemadas', 'otra']);
    });
});

// ── Geografía entre pueblos ──────────────────────────────────────────────────

describe('encadenado entre pueblos', () => {
    it('cada pueblo empieza por donde se sale del anterior', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Lucena', coords: punto(0), nombre: 'lucena_cerca' }),
            envio({ ciudad: 'Lucena', coords: punto(11), nombre: 'lucena_lejos' }),
            envio({ ciudad: 'Cabra', coords: punto(12), nombre: 'cabra_junto_a_lucena_lejos' }),
            envio({ ciudad: 'Cabra', coords: punto(1), nombre: 'cabra_junto_al_inicio' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Lucena', 'Cabra'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        // Se sale de Lucena por el punto lejano, así que en Cabra toca primero la de
        // al lado. Arrancando siempre del GPS inicial saldría la otra.
        expect(nombres(r)).toEqual([
            'lucena_cerca', 'lucena_lejos',
            'cabra_junto_a_lucena_lejos', 'cabra_junto_al_inicio',
        ]);
    });

    // La ruta de Francis. Sale de Cabra y lo más cerca le pilla Carcabuey, pero el
    // orden de la ruta es de prioridad de clientes, no de kilómetros: manda la lista.
    it('los pueblos de la ruta no se reordenan por cercanía', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Carcabuey', coords: punto(8), nombre: 'carcabuey' }),
            envio({ ciudad: 'Cabra', coords: punto(0), nombre: 'cabra' }),
            envio({ ciudad: 'Lucena', coords: punto(20), nombre: 'lucena' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra', 'Lucena', 'Carcabuey'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },   // saliendo de Cabra
        });
        expect(nombres(r)).toEqual(['cabra', 'lucena', 'carcabuey']);
        expect(r.resumen.extras).toBe(0);
    });

    // El reparto del 14/08: la ruta es la de La Rambla, que no tiene ni Cabra ni
    // Montilla, y ese día le meten un paquete en cada uno. Salía La Rambla primero y
    // luego la vuelta entera, 166 km.
    it('un pueblo de fuera de la ruta que pilla de camino se entrega al ir, no a la vuelta', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'La Rambla', coords: punto(45), nombre: 'la_rambla' }),
            envio({ ciudad: 'Cabra', coords: punto(0.5), nombre: 'cabra' }),
            envio({ ciudad: 'Montilla', coords: punto(28), nombre: 'montilla' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['La Rambla'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },   // parado en Cabra
        });
        expect(nombres(r)).toEqual(['cabra', 'montilla', 'la_rambla']);
        expect(r.resumen.extras).toBe(2);
        // El resumen enseña el orden con nombres: es lo que le dice al conductor si lo
        // que ve viene de su ruta o de la distancia.
        expect(r.resumen.ordenPueblos).toEqual(['Cabra', 'Montilla', 'La Rambla']);
        // Ordenando desde donde está, la primera le tiene que pillar al lado.
        expect(r.resumen.kmAlPrimero).toBe(1);
    });

    // Lo que delata que la posición usada no era la buena: se ordena "por cercanía" y
    // aun así la primera parada queda a 30 km.
    it('el resumen dice a cuánto queda la primera parada', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'La Rambla', coords: punto(30), nombre: 'la_rambla' }),
            envio({ ciudad: 'Cabra', coords: punto(0), nombre: 'cabra' }),
        ];
        // El conductor cree estar en Cabra, pero se optimiza con una posición vieja
        // que lo situa junto a La Rambla.
        const conPosicionVieja = optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            gps: { lat: norte(30), lon: este(0) },
        });
        expect(conPosicionVieja.resumen.ordenPueblos).toEqual(['La Rambla', 'Cabra']);
        expect(conPosicionVieja.resumen.kmAlPrimero).toBe(0);

        const desdeCabra = optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(desdeCabra.resumen.ordenPueblos).toEqual(['Cabra', 'La Rambla']);
        expect(desdeCabra.resumen.kmAlPrimero).toBe(0);
    });

    it('y sirve igual si el paquete de fuera no tiene ni dirección ni coordenadas', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'La Rambla', coords: punto(45), nombre: 'la_rambla' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'aviso_de_cabra' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['La Rambla'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
            resolverCoordenadasPueblo: (p) => p === 'Cabra' ? { lat: norte(0.5), lon: este(0) } : null,
        });
        expect(nombres(r)).toEqual(['aviso_de_cabra', 'la_rambla']);
    });

    // Es lo que pasaba de verdad: el GPS no contestaba en 5 s, se optimizaba con null
    // y "de camino" se medía desde el centro del reparto, un punto donde no está nadie.
    // Es lo que pasaba de verdad: el GPS no contestaba en 5 s, se optimizaba con null
    // y "de camino" se medía desde el centro del reparto, un punto donde no está nadie.
    it('sin posición no se sabe qué pilla de camino y sale la vuelta larga', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'La Rambla', coords: punto(45), nombre: 'la_rambla' }),
            envio({ ciudad: 'Cabra', coords: punto(0.5), nombre: 'cabra' }),
            envio({ ciudad: 'Montilla', coords: punto(28), nombre: 'montilla' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['La Rambla'] }];
        const r = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA, gps: null });
        // Deja Cabra para el final aunque el conductor esté allí: no lo sabe.
        expect(nombres(r)).toEqual(['montilla', 'la_rambla', 'cabra']);
        expect(r.resumen.sinPosicion).toBe(true);
    });

    it('avisa en el resumen cuando ha ordenado sin saber dónde estás', () => {
        contador = 0;
        const envios = [envio({ ciudad: 'Cabra', coords: punto(0), nombre: 'x' })];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];
        const conGps = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA, gps: { lat: norte(0), lon: este(0) },
        });
        const sinGps = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA, gps: null });
        expect(conGps.resumen.sinPosicion).toBe(false);
        expect(sinGps.resumen.sinPosicion).toBe(true);
        // Un GPS a medias (sin longitud) tampoco es una posición.
        expect(optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA, gps: { lat: norte(0) } })
            .resumen.sinPosicion).toBe(true);
    });

    it('sin ruta configurada ordena los pueblos por cercanía', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Lejos', coords: punto(22), nombre: 'lejos' }),
            envio({ ciudad: 'Medio', coords: punto(11), nombre: 'medio' }),
            envio({ ciudad: 'Cerca', coords: punto(1), nombre: 'cerca' }),
        ];
        const r = optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['cerca', 'medio', 'lejos']);
        expect(r.resumen.sinRuta).toBe(true);
    });

    it('una parada sin coordenadas propias usa las del pueblo para no irse siempre al final', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Aguilar de la Frontera', coords: punto(20), nombre: 'aguilar' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'pepe' }),
        ];
        // El conductor está físicamente en Cabra, pero "pepe" es una dirección nueva
        // sin coordenadas propias ni de cliente aprendidas. Otro cliente de Cabra sí
        // las tiene, y sirve de referencia de dónde cae el pueblo.
        const r = optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
            resolverCoordenadasPueblo: (pueblo) => pueblo === 'Cabra' ? { lat: norte(0.5), lon: este(0) } : null,
        });
        expect(nombres(r)).toEqual(['pepe', 'aguilar']);
    });

    it('sin ninguna referencia del pueblo, la parada sin coordenadas se queda al final', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Aguilar de la Frontera', coords: punto(20), nombre: 'aguilar' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'pepe' }),
        ];
        const r = optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['aguilar', 'pepe']);
    });

    // El caso del aviso por teléfono: se apunta el nombre y el pueblo, y ya está.
    it('una parada sin dirección se ordena por el pueblo, no al final del bloque', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Cabra', coords: punto(6), nombre: 'lejos_del_pueblo' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'aviso_por_telefono', destinationAddress: '' }),
            envio({ ciudad: 'Cabra', coords: punto(5.9), nombre: 'tambien_lejos' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
            // El centro de Cabra, que es lo único que se sabe del aviso.
            resolverCoordenadasPueblo: () => ({ lat: norte(0.5), lon: este(0) }),
        });
        // Cae junto al centro del pueblo, que es por donde se entra: antes salía el
        // último de los tres por no tener punto propio.
        expect(nombres(r)).toEqual(['aviso_por_telefono', 'tambien_lejos', 'lejos_del_pueblo']);
    });

    it('con dos paradas sin dirección en el mismo pueblo, no se estorban', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Cabra', coords: null, nombre: 'aviso_1' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'aviso_2' }),
            envio({ ciudad: 'Cabra', coords: punto(8), nombre: 'con_gps' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
            resolverCoordenadasPueblo: () => ({ lat: norte(0.5), lon: este(0) }),
        });
        expect(r.orden).toHaveLength(3);
        expect(nombres(r)[2]).toBe('con_gps');
    });

    it('el pueblo se pregunta una sola vez, por muchas paradas que tenga', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Cabra', coords: null, nombre: 'a' }),
            envio({ ciudad: 'CABRA (14940)', coords: null, nombre: 'b' }),
            envio({ ciudad: 'Cabra', coords: null, nombre: 'c' }),
        ];
        const preguntados = [];
        optimizarRuta({
            envios, rutas: [], conductorId: 7, ahora: MANANA,
            resolverCoordenadasPueblo: (p) => { preguntados.push(p); return { lat: norte(0.5), lon: este(0) }; },
        });
        expect(preguntados).toHaveLength(1);
    });

    it('los pueblos que no están en la ruta se cuelan donde menos desvían', () => {
        contador = 0;
        const envios = [
            envio({ ciudad: 'Lucena', coords: punto(0), nombre: 'lucena' }),
            envio({ ciudad: 'Cabra', coords: punto(20), nombre: 'cabra' }),
            envio({ ciudad: 'PuebloSuelto', coords: punto(10), nombre: 'suelto' }),
        ];
        const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Lucena', 'Cabra'] }];
        const r = optimizarRuta({
            envios, rutas, conductorId: 7, ahora: MANANA,
            gps: { lat: norte(0), lon: este(0) },
        });
        expect(nombres(r)).toEqual(['lucena', 'suelto', 'cabra']);
        expect(r.resumen.extras).toBe(1);
    });
});

// ── Robustez ─────────────────────────────────────────────────────────────────

describe('robustez', () => {
    const rutas = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra'] }];

    it('no pierde ni inventa envíos', () => {
        contador = 0;
        const envios = [
            envio({ coords: punto(0) }),
            envio({ coords: null }),
            envio({ ciudad: '', coords: null }),
            envio({ ciudad: 'Sevilla', coords: punto(200) }),
            envio({ coords: 'basura' }),
        ];
        const r = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden).toHaveLength(envios.length);
        expect(new Set(r.orden.map(e => e.id))).toEqual(new Set(envios.map(e => e.id)));
    });

    it('devuelve los envíos tal cual, sin campos de más', () => {
        contador = 0;
        const uno = envio({ coords: punto(0) });
        const r = optimizarRuta({ envios: [uno], rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden[0]).toBe(uno);
        expect(Object.keys(r.orden[0]).some(k => k.startsWith('_'))).toBe(false);
    });

    it('una ruta vacía no rompe nada', () => {
        const r = optimizarRuta({ envios: [], rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden).toEqual([]);
        expect(r.resumen.pueblos).toBe(0);
    });

    it('sin GPS del conductor se apaña con el centro de las paradas', () => {
        contador = 0;
        const envios = [envio({ coords: punto(0) }), envio({ coords: punto(4) })];
        const r = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA, gps: null });
        expect(r.orden).toHaveLength(2);
    });

    it('sin coordenadas en ninguna parada tampoco revienta', () => {
        contador = 0;
        const envios = [envio({ coords: null }), envio({ coords: null })];
        const r = optimizarRuta({ envios, rutas, conductorId: 7, ahora: MANANA });
        expect(r.orden).toHaveLength(2);
    });

    it('llamarlo sin argumentos devuelve algo coherente', () => {
        const r = optimizarRuta();
        expect(r.orden).toEqual([]);
        expect(r.deCamino.size).toBe(0);
    });

    it('una recogida se agrupa por el pueblo de origen, que es donde se para', () => {
        contador = 0;
        const recogida = envio({
            tipo: 'Recogida',
            ciudad: 'Lucena',
            coords: null,
            nombre: 'recogida',
            originCity: 'Cabra',
            originName: 'recogida',
            originCoordinates: punto(0),
        });
        const entrega = envio({ ciudad: 'Lucena', coords: punto(20), nombre: 'entrega' });
        const rutasDos = [{ id: 'r1', conductorId: 7, poblacionesManana: ['Cabra', 'Lucena'] }];
        const r = optimizarRuta({
            envios: [entrega, recogida], rutas: rutasDos, conductorId: 7, ahora: MANANA,
        });
        // Cabra va antes que Lucena en la ruta: si la recogida se hubiera agrupado por
        // el destino, saldría detrás.
        expect(nombres(r)).toEqual(['recogida', 'entrega']);
    });
});

describe('distanciaKm', () => {
    it('mide lo que tiene que medir', () => {
        expect(distanciaKm(BASE_LAT, BASE_LON, norte(1), BASE_LON)).toBeCloseTo(1, 1);
        expect(distanciaKm(BASE_LAT, BASE_LON, BASE_LAT, este(1))).toBeCloseTo(1, 1);
        expect(distanciaKm(BASE_LAT, BASE_LON, BASE_LAT, BASE_LON)).toBe(0);
    });
});
