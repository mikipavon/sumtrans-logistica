import { describe, it, expect } from 'vitest';
import {
    contarPueblos,
    contarClientes,
    borrarAprendizaje,
    recuperarAprendizaje,
    eliminarDeLaPapelera,
    fusionarConocimiento,
    claveAprendizaje,
    esClaveAprendizaje,
    driverIdDeClave,
    ensamblarConocimiento,
    conductoresConCambios,
} from './routeKnowledge';

const conocimientoDeEjemplo = () => ({
    masterByRoute: {
        r1: { cabra: { mamaki: { avg: 1.5, count: 10 } }, _setBy: '7', _setAt: '2026-01-01' }
    },
    byDriver: {
        7: {
            cabra: { mamaki: { avg: 1.5, count: 10 }, ferreteria: { avg: 2.3, count: 8 } },
            lucena: { barpepe: { avg: 1, count: 4 } }
        },
        9: { priego: { estanco: { avg: 1, count: 2 } } }
    }
});

describe('recuento', () => {
    it('no cuenta los metadatos como pueblos', () => {
        const master = conocimientoDeEjemplo().masterByRoute.r1;
        expect(contarPueblos(master)).toBe(1);       // cabra, sin _setBy ni _setAt
        expect(contarClientes(master)).toBe(1);
    });

    it('cuenta pueblos y clientes de un conductor', () => {
        const datos = conocimientoDeEjemplo().byDriver[7];
        expect(contarPueblos(datos)).toBe(2);
        expect(contarClientes(datos)).toBe(3);
    });

    it('aguanta datos vacíos o nulos', () => {
        expect(contarPueblos(null)).toBe(0);
        expect(contarClientes(undefined)).toBe(0);
    });

    // El formato nuevo parte cada pueblo por turnos. Contando a lo bruto salía "2".
    it('cuenta los clientes del formato partido por turnos', () => {
        const datos = {
            _v: 2,
            cabra: {
                manana: { mamaki: { orden: 0, count: 3 }, ferreteria: { orden: 1, count: 3 } },
                tarde: { mamaki: { orden: 0.5, count: 2 } },
            },
        };
        expect(contarPueblos(datos)).toBe(1);
        expect(contarClientes(datos)).toBe(2); // mamaki cuenta una vez, no dos
    });

    it('los dos formatos conviven mientras se van migrando los móviles', () => {
        const mezcla = {
            cabra: { manana: { mamaki: { orden: 0, count: 3 } } },
            lucena: { panaderia: { avg: 1.5, count: 4 } },
        };
        expect(contarPueblos(mezcla)).toBe(2);
        expect(contarClientes(mezcla)).toBe(2);
    });
});

describe('borrarAprendizaje', () => {
    it('saca al conductor de byDriver y lo deja en la papelera', () => {
        const antes = conocimientoDeEjemplo();
        const despues = borrarAprendizaje(antes, 7, '2026-07-29T10:00:00.000Z');

        expect(despues.byDriver[7]).toBeUndefined();
        expect(despues.trashByDriver[7].datos).toEqual(antes.byDriver[7]);
        expect(despues.trashByDriver[7].borradoEl).toBe('2026-07-29T10:00:00.000Z');
    });

    it('deja la orden para que el móvil del repartidor limpie su copia local', () => {
        const despues = borrarAprendizaje(conocimientoDeEjemplo(), 7, '2026-07-29T10:00:00.000Z');
        expect(despues.actionByDriver[7]).toEqual({ accion: 'borrado', fecha: '2026-07-29T10:00:00.000Z' });
    });

    it('no toca a los demás conductores ni al maestro', () => {
        const antes = conocimientoDeEjemplo();
        const despues = borrarAprendizaje(antes, 7);
        expect(despues.byDriver[9]).toEqual(antes.byDriver[9]);
        expect(despues.masterByRoute).toEqual(antes.masterByRoute);
    });

    it('no muta el objeto original', () => {
        const antes = conocimientoDeEjemplo();
        const copia = JSON.parse(JSON.stringify(antes));
        borrarAprendizaje(antes, 7);
        expect(antes).toEqual(copia);
    });

    it('se queda igual si el conductor no tiene aprendizaje', () => {
        const antes = conocimientoDeEjemplo();
        expect(borrarAprendizaje(antes, 999)).toBe(antes);
    });
});

describe('recuperarAprendizaje', () => {
    it('devuelve el aprendizaje exactamente como estaba', () => {
        const antes = conocimientoDeEjemplo();
        const original = antes.byDriver[7];
        const borrado = borrarAprendizaje(antes, 7);
        const recuperado = recuperarAprendizaje(borrado, 7);

        expect(recuperado.byDriver[7]).toEqual(original);
        expect(recuperado.trashByDriver[7]).toBeUndefined();
    });

    it('sustituye lo aprendido desde el borrado', () => {
        const borrado = borrarAprendizaje(conocimientoDeEjemplo(), 7);
        // El repartidor siguió trabajando y aprendió algo nuevo desde cero
        borrado.byDriver[7] = { nuevo: { cliente: { avg: 1, count: 1 } } };

        const recuperado = recuperarAprendizaje(borrado, 7);
        expect(recuperado.byDriver[7].nuevo).toBeUndefined();
        expect(contarPueblos(recuperado.byDriver[7])).toBe(2);
    });

    it('deja la orden de recuperación para el móvil', () => {
        const borrado = borrarAprendizaje(conocimientoDeEjemplo(), 7);
        const recuperado = recuperarAprendizaje(borrado, 7, '2026-07-29T12:00:00.000Z');
        expect(recuperado.actionByDriver[7]).toEqual({ accion: 'recuperado', fecha: '2026-07-29T12:00:00.000Z' });
    });

    it('se queda igual si no hay nada en la papelera', () => {
        const antes = conocimientoDeEjemplo();
        expect(recuperarAprendizaje(antes, 7)).toBe(antes);
    });
});

describe('eliminarDeLaPapelera', () => {
    it('vacía la entrada sin tocar el aprendizaje vivo', () => {
        const borrado = borrarAprendizaje(conocimientoDeEjemplo(), 7);
        const limpio = eliminarDeLaPapelera(borrado, 7);
        expect(limpio.trashByDriver[7]).toBeUndefined();
        expect(limpio.byDriver[9]).toEqual(conocimientoDeEjemplo().byDriver[9]);
    });
});

describe('fusionarConocimiento', () => {
    it('conserva lo que otro repartidor subió mientras tanto', () => {
        const enLaNube = conocimientoDeEjemplo();          // tiene al 7 y al 9
        const copiaVieja = conocimientoDeEjemplo();
        delete copiaVieja.byDriver[9];                      // este móvil no llegó a ver al 9
        copiaVieja.byDriver[7] = { cabra: { mamaki: { avg: 1.2, count: 20 } } };

        const fusionado = fusionarConocimiento(enLaNube, copiaVieja);
        expect(fusionado.byDriver[9]).toEqual(enLaNube.byDriver[9]);   // no se pierde
        expect(fusionado.byDriver[7]).toEqual(copiaVieja.byDriver[7]); // gana lo nuevo
    });

    it('arrastra papelera y órdenes de la nube aunque el móvil no las conozca', () => {
        const borrado = borrarAprendizaje(conocimientoDeEjemplo(), 9, '2026-07-29T10:00:00.000Z');
        const copiaVieja = conocimientoDeEjemplo(); // sin papelera ni órdenes

        const fusionado = fusionarConocimiento(borrado, copiaVieja);
        expect(fusionado.trashByDriver[9]).toBeDefined();
        expect(fusionado.actionByDriver[9].accion).toBe('borrado');
    });

    it('demuestra por qué el borrado NO puede pasar por la fusión', () => {
        const enLaNube = conocimientoDeEjemplo();
        const borrado = borrarAprendizaje(enLaNube, 7);

        // Si guardásemos el borrado fusionándolo con lo que hay en la nube...
        const fusionado = fusionarConocimiento(enLaNube, borrado);
        expect(fusionado.byDriver[7]).toBeDefined(); // ...el aprendizaje volvería

        // Por eso RoutesManagerModal llama con { fusionar: false }
        expect(borrado.byDriver[7]).toBeUndefined();
    });

    it('aguanta objetos vacíos', () => {
        expect(fusionarConocimiento(null, null)).toEqual({
            masterByRoute: {}, byDriver: {}, trashByDriver: {}, actionByDriver: {}
        });
    });
});

describe('Una fila de aprendizaje por conductor', () => {
    describe('claves', () => {
        it('compone y descompone la clave de un conductor', () => {
            expect(claveAprendizaje(7)).toBe('route_knowledge_driver_7');
            expect(driverIdDeClave('route_knowledge_driver_7')).toBe('7');
        });

        it('distingue las filas de aprendizaje del resto de settings', () => {
            expect(esClaveAprendizaje('route_knowledge_driver_7')).toBe(true);
            expect(esClaveAprendizaje('route_knowledge')).toBe(false);
            expect(esClaveAprendizaje('routes')).toBe(false);
            expect(esClaveAprendizaje('admin_pass')).toBe(false);
        });
    });

    describe('ensamblarConocimiento', () => {
        it('la fila del conductor manda sobre el byDriver antiguo', () => {
            const base = { byDriver: { '1': { cabra: 'viejo' } } };
            const salida = ensamblarConocimiento(base, { '1': { cabra: 'nuevo' } });
            expect(salida.byDriver['1']).toEqual({ cabra: 'nuevo' });
        });

        it('conserva el aprendizaje viejo de quien todavía no tiene fila propia', () => {
            const base = { byDriver: { '1': { cabra: 'viejo' }, '2': { lucena: 'viejo' } } };
            const salida = ensamblarConocimiento(base, { '1': { cabra: 'nuevo' } });
            expect(salida.byDriver['2']).toEqual({ lucena: 'viejo' });
        });

        it('una fila vacía borra de verdad: así se ve un borrado del administrador', () => {
            const base = { byDriver: { '1': { cabra: 'viejo' } } };
            const salida = ensamblarConocimiento(base, { '1': {} });
            expect(salida.byDriver['1']).toEqual({});
        });

        it('respeta el resto del objeto (maestro, papelera, buzón)', () => {
            const base = {
                masterByRoute: { r1: { cabra: {} } },
                trashByDriver: { '9': { datos: {}, borradoEl: 'ayer' } },
                actionByDriver: { '9': { accion: 'borrado' } },
                byDriver: {}
            };
            const salida = ensamblarConocimiento(base, { '1': { cabra: 'x' } });
            expect(salida.masterByRoute).toEqual(base.masterByRoute);
            expect(salida.trashByDriver).toEqual(base.trashByDriver);
            expect(salida.actionByDriver).toEqual(base.actionByDriver);
        });

        it('aguanta que no haya nada de nada', () => {
            expect(ensamblarConocimiento(null, null)).toEqual({ byDriver: {} });
        });
    });

    describe('conductoresConCambios', () => {
        it('no ve cambios donde no los hay', () => {
            const igual = { byDriver: { '1': { cabra: 'x' } } };
            expect(conductoresConCambios(igual, { byDriver: { '1': { cabra: 'x' } } })).toEqual({});
        });

        it('detecta el aprendizaje modificado de un conductor', () => {
            const antes = { byDriver: { '1': { cabra: 'x' }, '2': { lucena: 'y' } } };
            const despues = { byDriver: { '1': { cabra: 'z' }, '2': { lucena: 'y' } } };
            expect(conductoresConCambios(antes, despues)).toEqual({ '1': { cabra: 'z' } });
        });

        // Es el caso que importa: borrar quita la clave del objeto, y si eso no se
        // tradujera en vaciar su fila, al recargar reaparecería lo borrado.
        it('traduce un borrado en la fila vaciada, no en la fila intacta', () => {
            const antes = { byDriver: { '1': { cabra: 'x' } } };
            const despues = { byDriver: {} };
            expect(conductoresConCambios(antes, despues)).toEqual({ '1': {} });
        });

        it('detecta una recuperación desde la papelera', () => {
            const antes = { byDriver: {} };
            const despues = { byDriver: { '1': { cabra: 'x' } } };
            expect(conductoresConCambios(antes, despues)).toEqual({ '1': { cabra: 'x' } });
        });

        it('un borrado seguido de recuperación deja la fila como estaba', () => {
            const original = { byDriver: { '1': { cabra: 'x' } } };
            const borrado = borrarAprendizaje(original, '1');
            const recuperado = recuperarAprendizaje(borrado, '1');
            expect(conductoresConCambios(borrado, recuperado)).toEqual({ '1': { cabra: 'x' } });
        });

        it('aguanta objetos vacíos', () => {
            expect(conductoresConCambios(null, null)).toEqual({});
            expect(conductoresConCambios({}, {})).toEqual({});
        });
    });
});
