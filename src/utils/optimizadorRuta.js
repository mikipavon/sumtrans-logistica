/**
 * Optimizador de la ruta del repartidor.
 *
 * Estaba dentro del componente, con closures sobre ocho piezas de estado, y por eso
 * no se podía probar nada. Aquí es una función pura: entran los envíos, las rutas, el
 * aprendizaje y la hora; sale el orden. Los envíos salen tal cual entraron, sin
 * campos añadidos, para que nada de esto acabe en la nube por accidente.
 *
 * ── Las reglas del negocio ────────────────────────────────────────────────────────
 *
 * 1. Los pueblos se recorren en el orden que marca el turno que se está repartiendo:
 *    primero los del turno de ahora, después los del otro (si a alguien se le queda
 *    algo pendiente, no se pierde). Un pueblo que esté en los dos turnos sale UNA vez,
 *    en el sitio que le toca por el turno actual.
 *
 * 2. Dentro de cada pueblo, primero los nuestros (logo SUM) y después las agencias:
 *    con las agencias hay margen de entrega, con lo nuestro no.
 *
 * 3. Pero si una parada de agencia está de camino, se entrega al pasar — no vamos a
 *    pasar por la puerta y no dejarlo. "De camino" = a menos de 1 km y sin que
 *    desviarse a por ella cueste más de 1 km. Va marcada, para que el transportista
 *    vea por qué se ha colado y pueda moverla si ese día no le conviene.
 *
 * 4. El orden dentro del pueblo se aprende del transportista: cuando ya hay historial
 *    firme, manda el orden que él confirma y la geografía solo coloca a los clientes
 *    nuevos. Mientras no lo hay, manda la geografía y el historial desempata.
 */

import { normalizarPueblo, mejorPuebloParaCiudad } from './townMatch';
import { ciudadDeEnvio, nombreDeParada } from './shipmentUtils';
import { esDeAgencia } from './marca';
import { turnoQueSeRepartaAhora } from './turnos';
import {
    adaptarConocimiento,
    memoriaDelPueblo,
    confianzaDeMemoria,
    ordenDeCliente,
    contarPueblosMemorizados,
    UMBRAL_MEMORIA_FIRME,
} from './aprendizajeRuta';

/** Radio y desvío máximo para dar una parada por "de camino". */
export const RADIO_DE_CAMINO_KM = 1;

/** Cuántas paradas como máximo se cuelan tras una misma parada. */
export const MAX_ARRASTRE_DE_CAMINO = 2;

/** Cuánto puede mover el historial a una parada cuando aún no es firme (en km). */
const PESO_MEMORIA_KM = 0.8;

/** Lo que "pesa" no ser urgente, entre los nuestros (en km). */
const PESO_NO_URGENTE_KM = 0.3;

const RADIO_TIERRA_KM = 6371;

export const distanciaKm = (lat1, lon1, lat2, lon2) => {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distanciaEntre = (a, b) =>
    (a && b) ? distanciaKm(a.lat, a.lon, b.lat, b.lon) : Infinity;

export const parsearCoordenadas = (texto) => {
    if (!texto || !String(texto).includes(',')) return null;
    const [lat, lon] = String(texto).split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
};

const resolverCoordenadas = (envio, cliente) => {
    if (cliente?.coordinates && String(cliente.coordinates).trim()) return cliente.coordinates;
    if (envio.deliveryCoordinates) return envio.deliveryCoordinates;
    const propias = envio.type === 'Recogida' ? envio.originCoordinates : envio.destinationCoordinates;
    if (propias && String(propias).includes(',')) return propias;
    return null;
};

/**
 * La ruta de este conductor.
 *
 * Antes, si no encontraba ninguna, se usaban las rutas de ejemplo (DEFAULT_RUTAS) como
 * si fueran suyas. No lo son: no tienen conductor asignado, así que el conductor se
 * quedaba con los pueblos de otro o, más habitualmente, con ninguno. Mejor devolver
 * null y ordenar los pueblos por geografía.
 */
export const elegirRuta = (rutas, conductorId, routeId, ciudadesDeHoy = []) => {
    const lista = Array.isArray(rutas) ? rutas : [];
    const suyas = lista.filter(r =>
        r?.conductorId != null && String(r.conductorId) === String(conductorId));

    const porFicha = (routeId != null && routeId !== '')
        ? lista.find(r => r?.id != null && String(r.id) === String(routeId))
        : null;

    const candidatas = [...suyas];
    if (porFicha && !candidatas.includes(porFicha)) candidatas.push(porFicha);

    if (candidatas.length === 0) return null;
    if (candidatas.length === 1) return candidatas[0];

    // Varias rutas apuntan al mismo conductor. Pasa cuando alguien cubre la ruta de
    // otro: se le asigna la del que falta y se queda además con la suya de siempre.
    // Antes ganaba la primera del array, que podía ser la de todos los días, así que
    // los pueblos que hoy hay que hacer salían como "fuera de ruta" y se colocaban
    // por geografía en cualquier sitio. Gana la que más pueblos del reparto de HOY
    // cubre, que es la que se está haciendo.
    let mejor = candidatas[0];
    let mejorCobertura = -1;
    candidatas.forEach(ruta => {
        const pueblos = [
            ...(ruta.poblacionesManana || ruta.poblaciones || []),
            ...(ruta.poblacionesTarde || []),
        ];
        const cobertura = ciudadesDeHoy.filter(c => mejorPuebloParaCiudad(c, pueblos)).length;
        if (cobertura > mejorCobertura) { mejorCobertura = cobertura; mejor = ruta; }
    });
    return mejor;
};

/**
 * Los pueblos de la ruta en el orden en que hay que visitarlos: primero los del turno
 * que se reparte ahora, después los del otro.
 *
 * Deduplicado por nombre normalizado. Un pueblo puesto en los dos turnos —cosa que el
 * Gestor de Rutas permite a propósito— aparecía dos veces en la lista, y como el
 * ensamblado recorría la lista pidiendo el cubo de cada pueblo, metía DOS VECES los
 * mismos envíos: tarjetas duplicadas en el móvil e ids repetidos en la nube.
 */
export const pueblosDelTurno = (ruta, turno) => {
    if (!ruta) return [];
    const limpiar = (lista) => (Array.isArray(lista) ? lista : [])
        .map(p => String(p || '').trim())
        .filter(Boolean);

    const manana = limpiar(ruta.poblacionesManana || ruta.poblaciones);
    const tarde = limpiar(ruta.poblacionesTarde);
    const primero = turno === 'tarde' ? tarde : manana;
    const despues = turno === 'tarde' ? manana : tarde;

    const vistos = new Set();
    const salida = [];
    [...primero, ...despues].forEach(pueblo => {
        const clave = normalizarPueblo(pueblo);
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        salida.push(pueblo);
    });
    return salida;
};

const centroDe = (items) => {
    const con = items.filter(i => i.coords);
    if (con.length === 0) return null;
    return {
        lat: con.reduce((s, i) => s + i.coords.lat, 0) / con.length,
        lon: con.reduce((s, i) => s + i.coords.lon, 0) / con.length,
    };
};

/** Lo que cuesta meter `punto` entre `previo` y `siguiente`. */
const costeDeInsercion = (previo, punto, siguiente) => {
    const entrada = previo ? distanciaEntre(previo, punto) : 0;
    if (!siguiente) return entrada;
    const salida = distanciaEntre(punto, siguiente);
    const directa = previo ? distanciaEntre(previo, siguiente) : 0;
    return entrada + salida - directa;
};

const agruparPorCiudad = (items) => {
    const mapa = new Map();
    items.forEach(item => {
        const clave = normalizarPueblo(item.ciudad) || '__sin_pueblo__';
        if (!mapa.has(clave)) mapa.set(clave, { pueblo: item.ciudad || '', items: [] });
        mapa.get(clave).items.push(item);
    });
    return [...mapa.values()];
};

/** Sin ruta configurada: cadena de pueblos por cercanía, que es mejor que el azar. */
const secuenciaGeografica = (items, puntoInicial) => {
    const restantes = agruparPorCiudad(items);
    const grupos = [];
    let cursor = puntoInicial;
    while (restantes.length > 0) {
        let mejor = 0;
        let mejorDist = Infinity;
        restantes.forEach((grupo, i) => {
            const centro = centroDe(grupo.items);
            const dist = distanciaEntre(cursor, centro);
            if (dist < mejorDist) { mejorDist = dist; mejor = i; }
        });
        const elegido = restantes.splice(mejor, 1)[0];
        grupos.push(elegido);
        const centro = centroDe(elegido.items);
        if (centro) cursor = centro;
    }
    return { grupos, extras: 0, sinRuta: true };
};

const secuenciaDePueblos = (items, pueblosRuta, puntoInicial) => {
    if (pueblosRuta.length === 0) return secuenciaGeografica(items, puntoInicial);

    const cubos = new Map();
    const sueltos = [];
    items.forEach(item => {
        const encaje = mejorPuebloParaCiudad(item.ciudad, pueblosRuta);
        if (!encaje) { sueltos.push(item); return; }
        const clave = normalizarPueblo(encaje);
        if (!cubos.has(clave)) cubos.set(clave, { pueblo: encaje, items: [] });
        cubos.get(clave).items.push(item);
    });

    const grupos = pueblosRuta
        .map(pueblo => cubos.get(normalizarPueblo(pueblo)))
        .filter(grupo => grupo && grupo.items.length > 0);

    if (sueltos.length === 0) return { grupos, extras: 0, sinRuta: false };

    // Los pueblos que no están en la ruta se cuelan donde menos desvíen. Antes se
    // decidía "antes o después" comparando con dónde estaba el conductor al pulsar el
    // botón, lo cual solo tiene sentido para el primer pueblo del día.
    agruparPorCiudad(sueltos).forEach(suelto => {
        const centro = centroDe(suelto.items);
        if (!centro || grupos.length === 0) { grupos.push(suelto); return; }
        let mejor = grupos.length;
        let mejorCoste = Infinity;
        for (let i = 0; i <= grupos.length; i++) {
            const previo = i === 0 ? puntoInicial : centroDe(grupos[i - 1].items);
            const siguiente = i < grupos.length ? centroDe(grupos[i].items) : null;
            const coste = costeDeInsercion(previo, centro, siguiente);
            if (coste < mejorCoste) { mejorCoste = coste; mejor = i; }
        }
        grupos.splice(mejor, 0, suelto);
    });

    return { grupos, extras: sueltos.length, sinRuta: false };
};

/**
 * El historial que aplica a este pueblo. El propio del conductor manda; si no tiene,
 * se hereda del maestro de SU ruta antes que del de cualquier otra, que es lo que
 * antes no se hacía: se cogía el primer maestro que resultara conocer el pueblo.
 */
const memoriaAplicable = (pueblo, contexto) => {
    const propia = memoriaDelPueblo(contexto.propia, pueblo, contexto.turno);
    if (Object.keys(propia).length > 0) return propia;

    if (contexto.maestroPropio) {
        const maestra = memoriaDelPueblo(contexto.maestroPropio, pueblo, contexto.turno);
        if (Object.keys(maestra).length > 0) return maestra;
    }
    for (const datos of contexto.otrosMaestros) {
        const maestra = memoriaDelPueblo(datos, pueblo, contexto.turno);
        if (Object.keys(maestra).length > 0) return maestra;
    }
    for (const datos of contexto.otrosConductores) {
        const ajena = memoriaDelPueblo(datos, pueblo, contexto.turno);
        if (Object.keys(ajena).length > 0) return ajena;
    }
    return {};
};

/**
 * Mete `item` en la cadena por donde menos la desvíe.
 *
 * En caso de empate gana la posición más tardía (el `<=`): cuando cuesta lo mismo
 * meter a un cliente nuevo antes o después de uno aprendido, se respeta el aprendido.
 * Con `<`, un cliente que aparece por primera vez se colaba delante del que el
 * transportista lleva meses haciendo primero.
 */
const insertarDondeMenosDesvie = (cadena, item, entrada) => {
    if (!item.coords || cadena.length === 0) { cadena.push(item); return; }
    let mejor = cadena.length;
    let mejorCoste = Infinity;
    for (let i = 0; i <= cadena.length; i++) {
        const previo = i === 0 ? entrada : cadena[i - 1].coords;
        const siguiente = i < cadena.length ? cadena[i].coords : null;
        const coste = costeDeInsercion(previo, item.coords, siguiente);
        if (coste <= mejorCoste) { mejorCoste = coste; mejor = i; }
    }
    cadena.splice(mejor, 0, item);
};

/** Historial firme: manda el orden aprendido, la geografía solo coloca lo nuevo. */
const ordenarPorMemoria = (items, memoria, entrada) => {
    const conocidos = [];
    const nuevos = [];
    items.forEach(item => {
        const orden = ordenDeCliente(memoria, item.nombre);
        if (orden === null) nuevos.push(item);
        else conocidos.push({ item, orden });
    });
    conocidos.sort((a, b) => a.orden - b.orden);
    const cadena = conocidos.map(c => c.item);
    nuevos.forEach(item => insertarDondeMenosDesvie(cadena, item, entrada));
    return cadena;
};

/** Historial flojo: vecino más cercano, con el historial desempatando. */
const ordenarPorGeografia = (items, memoria, confianza, entrada) => {
    const restantes = [...items];
    const salida = [];
    let cursor = entrada;
    while (restantes.length > 0) {
        let mejor = 0;
        let mejorScore = Infinity;
        restantes.forEach((item, i) => {
            const dist = cursor ? distanciaEntre(cursor, item.coords) : 0;
            const orden = ordenDeCliente(memoria, item.nombre);
            const sesgoMemoria = (orden === null ? 0.5 : orden) * PESO_MEMORIA_KM * confianza;
            const sesgoUrgencia = item.urgente ? 0 : PESO_NO_URGENTE_KM;
            const score = dist + sesgoMemoria + sesgoUrgencia;
            if (score < mejorScore) { mejorScore = score; mejor = i; }
        });
        const elegido = restantes.splice(mejor, 1)[0];
        salida.push(elegido);
        cursor = elegido.coords;
    }
    return salida;
};

const ordenarBloque = (bloque, memoria, entrada) => {
    const conCoords = bloque.filter(i => i.coords);
    const sinCoords = bloque.filter(i => !i.coords);
    const confianza = confianzaDeMemoria(memoria, bloque.map(i => i.nombre));

    const ordenados = confianza >= UMBRAL_MEMORIA_FIRME
        ? ordenarPorMemoria(conCoords, memoria, entrada)
        : ordenarPorGeografia(conCoords, memoria, confianza, entrada);

    // Sin coordenadas no se puede optimizar: al final del bloque, por historial y
    // luego por dirección, que al menos deja juntas las de la misma calle.
    sinCoords.sort((a, b) => {
        const oa = ordenDeCliente(memoria, a.nombre);
        const ob = ordenDeCliente(memoria, b.nombre);
        if (oa !== ob) return (oa ?? 9) - (ob ?? 9);
        return String(a.direccion).localeCompare(String(b.direccion));
    });

    return [...ordenados, ...sinCoords];
};

/**
 * Cuela las paradas que quedan de camino.
 *
 * Dos cosas distintas del pase anterior:
 *  · La distancia se mide siempre desde la parada en la que estamos, no desde la
 *    última arrastrada. Encadenando saltos de 500 m se acababa a kilómetros del hilo.
 *  · Además del radio se mira el desvío real (ir y volver al rumbo). Un radio a secas
 *    también arrastra lo que está detrás, en dirección contraria a la marcha.
 */
const pasarDeCamino = (lista, deCamino, radioKm) => {
    const restantes = [...lista];
    const salida = [];

    while (restantes.length > 0) {
        const actual = restantes.shift();
        salida.push(actual);
        if (!actual.coords || restantes.length < 2) continue;

        const rumbo = restantes[0].coords || null;
        const elegidas = [];
        for (let i = 1; i < restantes.length && elegidas.length < MAX_ARRASTRE_DE_CAMINO; i++) {
            const candidata = restantes[i];
            if (!candidata.coords) continue;
            if (distanciaEntre(actual.coords, candidata.coords) > radioKm) continue;
            if (costeDeInsercion(actual.coords, candidata.coords, rumbo) > radioKm) continue;
            elegidas.push(candidata);
        }

        elegidas.forEach(candidata => {
            const idx = restantes.indexOf(candidata);
            if (idx >= 0) restantes.splice(idx, 1);
            salida.push(candidata);
            deCamino.add(candidata.envio.id);
        });
    }

    return salida;
};

const ordenarDentroDelPueblo = (items, pueblo, entrada, contexto, deCamino, radioKm) => {
    const memoria = memoriaAplicable(pueblo, contexto);

    // Los nuestros antes que las agencias. La prioridad del cliente ya no decide
    // esto: un cliente nuestro marcado como "normal" seguía siendo nuestro y acababa
    // en el bloque de las agencias.
    const nuestros = items.filter(i => !i.agencia);
    const agencias = items.filter(i => i.agencia);

    let cursor = entrada;
    const ordenado = [];
    [nuestros, agencias].forEach(bloque => {
        if (bloque.length === 0) return;
        const trozo = ordenarBloque(bloque, memoria, cursor);
        ordenado.push(...trozo);
        const ultimo = [...trozo].reverse().find(i => i.coords);
        if (ultimo) cursor = ultimo.coords;
    });

    return pasarDeCamino(ordenado, deCamino, radioKm);
};

/**
 * Ordena la ruta.
 *
 * @returns {{orden: object[], deCamino: Set<string|number>, resumen: object}}
 */
export const optimizarRuta = ({
    envios = [],
    rutas = [],
    conductorId = null,
    routeId = null,
    resolverCliente = () => null,
    aprendizaje = null,
    conocimiento = null,
    gps = null,
    ahora = new Date(),
    radioDeCaminoKm = RADIO_DE_CAMINO_KM,
} = {}) => {
    const turno = turnoQueSeRepartaAhora(ahora);
    const lista = (envios || []).filter(Boolean);

    if (lista.length === 0) {
        return {
            orden: [],
            deCamino: new Set(),
            resumen: { turno, ruta: null, pueblos: 0, extras: 0, sinRuta: true, deCamino: 0, pueblosMemorizados: 0 },
        };
    }

    const items = lista.map(envio => {
        const cliente = resolverCliente(envio);
        return {
            envio,
            coords: parsearCoordenadas(resolverCoordenadas(envio, cliente)),
            agencia: esDeAgencia(envio, cliente),
            urgente: (cliente?.priority || 'urgent') === 'urgent',
            ciudad: ciudadDeEnvio(envio),
            nombre: nombreDeParada(envio),
            direccion: envio.destinationAddress || '',
        };
    });

    // Los pueblos del reparto de hoy se calculan ANTES de elegir la ruta: cuando hay
    // más de una candidata, son los que dicen cuál se está haciendo.
    const ruta = elegirRuta(rutas, conductorId, routeId, items.map(i => i.ciudad));
    const pueblosRuta = pueblosDelTurno(ruta, turno);

    // Punto de partida de la cadena: el GPS del conductor si lo hay, y si no el
    // centro de las paradas del día.
    const puntoInicial = (gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lon))
        ? { lat: gps.lat, lon: gps.lon }
        : centroDe(items);

    const { grupos, extras, sinRuta } = secuenciaDePueblos(items, pueblosRuta, puntoInicial);

    const contexto = {
        turno,
        propia: adaptarConocimiento(aprendizaje),
        maestroPropio: ruta?.id ? adaptarConocimiento(conocimiento?.masterByRoute?.[ruta.id]) : null,
        otrosMaestros: Object.entries(conocimiento?.masterByRoute || {})
            .filter(([id]) => String(id) !== String(ruta?.id))
            .map(([, datos]) => adaptarConocimiento(datos)),
        otrosConductores: Object.entries(conocimiento?.byDriver || {})
            .filter(([id]) => String(id) !== String(conductorId))
            .map(([, datos]) => adaptarConocimiento(datos)),
    };

    const deCamino = new Set();
    const ordenados = [];
    // El vecino más cercano de cada pueblo arranca por donde se sale del anterior. Antes
    // arrancaba siempre del GPS inicial, así que el cuarto pueblo del día se ordenaba
    // según lo que estaba cerca de la nave a las ocho de la mañana.
    let entrada = puntoInicial;
    grupos.forEach(grupo => {
        const trozo = ordenarDentroDelPueblo(
            grupo.items, grupo.pueblo, entrada, contexto, deCamino, radioDeCaminoKm);
        ordenados.push(...trozo);
        const ultimo = [...trozo].reverse().find(i => i.coords);
        if (ultimo) entrada = ultimo.coords;
    });

    // Red de seguridad: que no se pierda ningún envío por el camino.
    const colocados = new Set(ordenados.map(i => i.envio.id));
    items.forEach(item => {
        if (!colocados.has(item.envio.id)) ordenados.push(item);
    });

    return {
        orden: ordenados.map(i => i.envio),
        deCamino,
        resumen: {
            turno,
            // Con qué ruta se ha ordenado. Va en el resumen para que el conductor lo
            // vea al terminar: si hoy cubre la de otro, es la única forma de saber si
            // ha cogido la buena sin tener que abrir el Gestor de Rutas.
            ruta: ruta?.nombre || null,
            pueblos: grupos.length,
            extras,
            sinRuta,
            deCamino: deCamino.size,
            pueblosMemorizados: contarPueblosMemorizados(aprendizaje),
        },
    };
};
