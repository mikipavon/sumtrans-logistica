import { puedeAsignarloEsteConductor, vieneDelPortal } from './shipmentUtils';
import { puebloDeRutaParaEnvio, esElMismoPueblo } from './townMatch';

/**
 * De quién depende un albarán «Pendiente de asignar», para la columna Asignar
 * del listado de Envíos.
 *
 * El problema que resuelve (29/09/2026): unos pendientes son del cliente, que lo
 * dio de alta en el portal y aún no se ha recogido; otros los tiene un
 * transportista en su pestaña Asignar del móvil y tarda días en pasarlo. En la
 * oficina salían todos igual. Y cuando Javito recoge algo que va en la ruta de
 * Francis, sólo le sale a Javito: hay que ver si lo tiene quien lo va a llevar
 * (verde) o se ha quedado en manos de otro (rojo).
 */

const hay = (id) => id !== null && id !== undefined && id !== '';

/**
 * Los conductores que lo ven en su pestaña Asignar, con la misma regla que el
 * móvil (puedeAsignarloEsteConductor): el que lo devolvió, y si no, el que lo
 * creó o el que escaneó los bultos. Sólo conductores que existen: el creador de
 * un albarán del portal es el id de la ficha del cliente, no de un conductor.
 */
export const conductoresConElPendiente = (shipment, drivers = []) => {
    if (!shipment || shipment.status !== 'Pendiente de asignar') return [];
    if (vieneDelPortal(shipment) && !hay(shipment.pickedUpById) && !hay(shipment.returnedToAssignById)) return [];

    const candidatos = [shipment.returnedToAssignById, shipment.createdById, shipment.pickedUpById].filter(hay);
    const vistos = new Set();
    const resultado = [];
    for (const id of candidatos) {
        const driver = (drivers || []).find(d => String(d.id) === String(id));
        if (!driver || vistos.has(String(driver.id))) continue;
        if (!puedeAsignarloEsteConductor(shipment, driver.id)) continue;
        vistos.add(String(driver.id));
        resultado.push(driver);
    }
    return resultado;
};

/**
 * Los conductores cuya ruta (mañana o tarde) pasa por el pueblo del albarán:
 * el destino, o el origen si es una recogida. Misma búsqueda del pueblo que las
 * sugerencias de la pestaña Asignar del móvil.
 */
export const conductoresDeSuRuta = (shipment, routes = [], tablaBaremo = []) => {
    if (!shipment) return [];
    const esRecogida = shipment.type === 'Recogida';
    const ciudad = esRecogida ? shipment.originCity : shipment.destinationCity;
    const cp = esRecogida ? shipment.originZip : shipment.destinationZip;
    const rutas = Array.isArray(routes) ? routes : [];

    const todosLosPueblos = rutas.flatMap(r => [...(r.poblacionesManana || []), ...(r.poblacionesTarde || [])]);
    const pueblo = puebloDeRutaParaEnvio(ciudad || '', cp || '', todosLosPueblos, tablaBaremo);
    if (!pueblo) return [];

    const ids = [];
    for (const r of rutas) {
        if (!hay(r.conductorId)) continue;
        const pasa = [...(r.poblacionesManana || []), ...(r.poblacionesTarde || [])].some(p => esElMismoPueblo(p, pueblo));
        if (pasa && !ids.includes(String(r.conductorId))) ids.push(String(r.conductorId));
    }
    return ids;
};

/**
 * Días enteros (de calendario) desde que le llegó a quien lo tiene: el alta, o
 * el escaneo de los bultos si fue después. null si no hay fecha que leer.
 */
export const diasEnAsignar = (shipment, ahora = new Date()) => {
    const ms = (v) => {
        const t = v ? new Date(v).getTime() : NaN;
        return Number.isNaN(t) ? null : t;
    };
    const fechas = [ms(shipment?.createdAt), ms(shipment?.pickedUpAt)].filter(t => t !== null);
    if (fechas.length === 0) return null;
    const desde = new Date(Math.max(...fechas));
    const inicio = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.max(0, Math.round((inicio(ahora) - inicio(desde)) / 86400000));
};

export const textoDeDias = (dias) => {
    if (dias === null || dias === undefined) return '';
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return `hace ${dias} días`;
};

/**
 * Todo lo que enseña la columna Asignar para un albarán, o null si no está
 * pendiente de asignar.
 *
 * tipo: 'transportista' → conductores: [{ driver, deSuRuta }]
 *       'cliente'       → lo dio de alta el cliente y nadie lo ha recogido
 *       'oficina'       → lo tecleó la oficina: no sale en el Asignar de nadie
 * rutaDe: ids de los conductores cuya ruta pasa por el pueblo (para el aviso).
 */
export const pendienteEnAsignar = (shipment, { drivers = [], routes = [], tablaBaremo = [], ahora = new Date() } = {}) => {
    if (!shipment || shipment.status !== 'Pendiente de asignar') return null;

    const rutaDe = conductoresDeSuRuta(shipment, routes, tablaBaremo);
    const dias = diasEnAsignar(shipment, ahora);
    const conductores = conductoresConElPendiente(shipment, drivers).map(driver => ({
        driver,
        deSuRuta: rutaDe.includes(String(driver.id)),
    }));

    if (conductores.length > 0) return { tipo: 'transportista', conductores, rutaDe, dias };
    if (vieneDelPortal(shipment)) return { tipo: 'cliente', conductores: [], rutaDe, dias };
    return { tipo: 'oficina', conductores: [], rutaDe, dias };
};
