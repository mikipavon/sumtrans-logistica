// ── Alta automática de fichas: una sola ficha por cliente ──
//
// Al cerrar un albarán la misma empresa se daba de alta desde dos sitios a la
// vez: CreateShipmentModal la crea al pulsar guardar, y handleAddShipment la
// vuelve a crear al escribir el envío en Supabase. Cada una traía datos
// distintos —la del modal sin coordenadas, la de App con ellas— así que en
// Validar Clientes salían dos tarjetas de la misma empresa, una con GPS y otra
// sin él, y ninguna de las dos completa.
//
// El guardia que había en handleAddClient no lo veía porque miraba
// `clientsRef.current`, que se refresca en un useEffect: cuando las dos altas
// caen en el mismo tick, las dos leen la foto anterior y las dos insertan.
//
// Aquí vive lo que hace falta para que quede una sola ficha: cómo se comparan
// los nombres y qué huecos rellena el alta que llega la segunda.

// Mismo criterio que normalizeClientName en App.jsx y DriverDashboard.jsx: sin
// acentos, sin mayúsculas y sin espacios de más. El guardia anterior no quitaba
// acentos, y por eso "Rafa Martínez" y "Rafa Martinez" pasaban por dos empresas.
export const normalizarNombreCliente = (nombre) => {
    if (!nombre) return '';
    return String(nombre)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
};

// La ficha que ya representa a ese nombre, sea la madre, su razón social o una
// de sus sedes. Devuelve { client, branch } —branch a null si es la madre— para
// que quien rellene huecos sepa dónde escribirlos.
export function buscarFichaPorNombre(nombre, clients = []) {
    const buscado = normalizarNombreCliente(nombre);
    if (!buscado) return null;

    for (const client of clients) {
        if (!client) continue;
        if (normalizarNombreCliente(client.name) === buscado
            || normalizarNombreCliente(client.legalName) === buscado) {
            return { client, branch: null };
        }
        if (Array.isArray(client.branches)) {
            const branch = client.branches.find(b => normalizarNombreCliente(b?.name) === buscado);
            if (branch) return { client, branch };
        }
    }
    return null;
}

// "Conductor" o "Driver" a secas no dicen quién hizo el albarán: son el valor
// que se escribía cuando no se resolvía el nombre. Cuentan como hueco, para que
// un alta posterior que sí traiga el nombre real pueda sustituirlos.
export function esCreadorGenerico(valor) {
    return ['conductor', 'driver', ''].includes(String(valor || '').trim().toLowerCase());
}

const estaVacio = (valor) => String(valor ?? '').trim() === '';

// Datos de contacto y ubicación que un alta automática puede traer. Ni el
// nombre, ni el tipo, ni el estado, ni la facturación: eso lo decide quien
// valida, no el albarán siguiente.
const CAMPOS_RELLENABLES = ['address', 'city', 'zip', 'phone', 'mobile', 'email', 'coordinates'];

// Qué le falta a la ficha que ya existe y trae el alta nueva. Sólo rellena
// huecos: nunca pisa un dato que ya estuviera puesto, porque el que está puede
// venir de una corrección a mano y el que llega, de un albarán mal tecleado.
export function huecosQueRellena(existente, nuevo) {
    if (!existente || !nuevo) return {};
    const huecos = {};

    for (const campo of CAMPOS_RELLENABLES) {
        if (estaVacio(existente[campo]) && !estaVacio(nuevo[campo])) {
            huecos[campo] = String(nuevo[campo]).trim();
        }
    }

    // El nombre de quien la creó sí sustituye al genérico: saber que fue
    // "Cond.FRANCISCO JAVIER PAVON MAIZ" y no "Conductor" es justo lo que hace
    // falta en Validar para poder preguntarle.
    if (esCreadorGenerico(existente.createdBy) && !esCreadorGenerico(nuevo.createdBy)) {
        huecos.createdBy = nuevo.createdBy;
        if (nuevo.createdById != null) huecos.createdById = nuevo.createdById;
        if (nuevo.creatorId != null) huecos.creatorId = nuevo.creatorId;
    }

    return huecos;
}

// ── Turno por cliente ──
//
// El alta no se puede esperar: el conductor cierra el albarán y el albarán tiene
// que salir, aunque Supabase tarde treinta segundos en confirmar la ficha. Pero
// si no se espera, las dos altas del mismo remitente —la del modal del albarán y
// la de handleAddShipment un instante después— arrancan a la vez, las dos miran
// la lista de clientes de antes, las dos ven que no está y las dos la crean.
//
// Esto pone turnos: dos altas del MISMO nombre van una detrás de otra, así que
// la segunda ya encuentra a la primera hecha. Dos nombres distintos no se
// estorban. El apunte del turno es lo primero que pasa, sin ceder el hilo, que
// es justo lo que fallaba antes: `clientsRef` no se entera hasta el render
// siguiente y para entonces ya es tarde.
export function crearColaDeAltas() {
    const enVuelo = new Map();

    return {
        // `trabajo` se ejecuta cuando le toque el turno a ese nombre. La promesa
        // que se devuelve nunca se rompe: el que espera sólo necesita saber que
        // ya puede volver a mirar, no si al de delante le fue bien.
        encolar(clave, trabajo) {
            const anterior = enVuelo.get(clave) || Promise.resolve();
            const turno = anterior.then(() => trabajo()).catch(() => { });
            enVuelo.set(clave, turno);
            // Se limpia sólo si nadie se ha puesto detrás mientras tanto.
            turno.then(() => {
                if (enVuelo.get(clave) === turno) enVuelo.delete(clave);
            });
            return turno;
        },

        // Cuántos nombres tienen algo en marcha. Sólo para comprobarlo.
        get pendientes() { return enVuelo.size; },
    };
}

// De dónde nace la ficha. Vive aquí y no en la pantalla de Validar porque hay
// dos sitios que necesitan saberlo: esa pantalla, para separar las pestañas, y
// el alta a mano, para poder decir en qué pestaña está la ficha que estorba.
export function esRegistroWeb(client) {
    return String(client?.createdFrom || '') === 'web-registro';
}
