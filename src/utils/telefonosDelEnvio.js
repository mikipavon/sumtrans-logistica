import { nombreDestinatarioEnRuta, quienPagaElPorte } from './shipmentUtils';

/**
 * Los teléfonos de un albarán y de las fichas de sus dos puntas: de aquí salen
 * los números que ofrece el justificante de WhatsApp, tanto al repartidor (en la
 * tarjeta de la parada) como a la oficina (en el detalle del albarán de Envíos).
 * Vivía dentro del panel del repartidor, y la oficina no podía usarlo sin cargar
 * el panel entero.
 */

const normalizeClientName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/s+/g, " ");
};

// ── ¿Es un fijo? ──
// En España los móviles empiezan por 6 o 7 y los fijos por 8 o 9. Un fijo no
// tiene WhatsApp, así que mandarle ahí el justificante es tirarlo. Solo damos
// por fijo lo que reconocemos como número español de 9 cifras: un extranjero o
// cualquier cosa rara se manda tal cual, que de eso sabe más el conductor.
export const esFijoEspanol = (numero) => {
    const limpio = String(numero || '').replace(/[\s.\-()+]/g, '');
    const nacional = limpio.startsWith('34') ? limpio.slice(2) : limpio;
    return nacional.length === 9 && /^[89]/.test(nacional);
};

// Mismo número escrito de dos formas (con prefijo, con espacios) es uno solo.
const claveDeTelefono = (numero) => String(numero || '')
    .replace(/[\s.\-()+]/g, '')
    .replace(/^34/, '');

// Los teléfonos de UN contacto del albarán (el remitente o el destinatario), MÓVILES
// PRIMERO: a un cliente se le localiza antes en el móvil, y el fijo de la nave no lo
// coge nadie a media tarde. De aquí salen tanto los números del justificante de
// WhatsApp (que solo pueden ser móviles) como la lista del botón de llamar.
//
// Se juntan dos fuentes porque ninguna basta sola: el teléfono del albarán es el
// más concreto —lo tecleó quien creó el envío— pero el autorrelleno solo baja el
// 'phone' de la ficha, así que un móvil guardado en 'mobile' no llega nunca al
// albarán.
//
// Se busca por nombre exacto, no con la tolerancia de marca de buscarClienteDeEnvio:
// esa empareja también por etiqueta de agencia, y un albarán de TSB acabaría
// ofreciendo el teléfono de la agencia en vez del de quien recibe el paquete.
// Los dos huecos de teléfono de la ficha que responde a un nombre, o null si no
// hay ficha. La sede manda sobre la ficha madre, pero si a la sede le falta un
// hueco se completa con el de la madre: es la misma empresa.
export const telefonosDeLaFicha = (nombreCrudo, clientes) => {
    const nombre = normalizeClientName(nombreCrudo);
    if (!nombre || !Array.isArray(clientes)) return null;
    for (const c of clientes) {
        if (!c) continue;
        const sede = (c.branches || []).find(b => normalizeClientName(b?.name) === nombre);
        if (sede) return { phone: sede.phone || c.phone || '', mobile: sede.mobile || c.mobile || '' };
        if (normalizeClientName(c.name) === nombre || normalizeClientName(c.legalName) === nombre) {
            return { phone: c.phone || '', mobile: c.mobile || '' };
        }
    }
    return null;
};

/**
 * Dónde iría un móvil nuevo en la ficha de este contacto. La ficha sólo tiene dos
 * huecos (teléfono y móvil), así que:
 *   'nueva'      no hay ficha: se crea.
 *   'phone'      el hueco de teléfono está libre.
 *   'mobile'     el de móvil está libre (o lo ocupa un fijo, que ahí no sirve).
 *   'sustituye'  los dos ocupados: el nuevo pisa al móvil. Se avisa antes.
 */
export const destinoDelTelefonoNuevo = (ficha) => {
    if (!ficha) return 'nueva';
    const phone = String(ficha.phone || '').trim();
    const mobile = String(ficha.mobile || '').trim();
    if (!phone) return 'phone';
    if (!mobile || esFijoEspanol(mobile)) return 'mobile';
    return 'sustituye';
};

const telefonosDelContacto = (nombreCrudo, delAlbaran, clientes) => {
    const ficha = telefonosDeLaFicha(nombreCrudo, clientes);
    const fichaPhone = ficha?.phone || null;
    const fichaMobile = ficha?.mobile || null;

    const vistos = new Set();
    const lista = [];
    [delAlbaran, fichaMobile, fichaPhone].forEach(numero => {
        const texto = String(numero || '').trim();
        if (!texto) return;
        const clave = claveDeTelefono(texto);
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        lista.push({ numero: texto, esFijo: esFijoEspanol(texto) });
    });

    // Móviles delante, respetando dentro de cada grupo el orden de arriba.
    return [...lista.filter(t => !t.esFijo), ...lista.filter(t => t.esFijo)];
};

// La parada de ESTE conductor: el remitente si va a recoger, el destinatario si va
// a entregar. De aquí salen el botón de llamar y la ficha donde se guarda un número
// nuevo.
export const telefonosDeLaParada = (stop, clientes) => {
    if (!stop) return [];
    const esRecogida = stop.type === 'Recogida';
    return telefonosDelContacto(
        esRecogida ? (stop.originName || stop.client) : nombreDestinatarioEnRuta(stop, clientes),
        esRecogida ? stop.originPhone : stop.destinationPhone,
        clientes,
    );
};

/**
 * Las DOS puntas del albarán para la ventana de "Enviar Justificante": el
 * justificante le interesa tanto a quien recibe el paquete como a quien lo mandó
 * (que muchas veces es quien paga el porte y quiere ver que llegó).
 *
 * Delante va la punta donde está el conductor ahora mismo, que es la que va a usar
 * nueve de cada diez veces. De cada punta salen sus móviles (los fijos no: no
 * tienen WhatsApp) y, si no tiene ninguno, lo que haría falta para darle uno.
 *
 * @returns [{
 *   papel, nombre, paga,
 *   moviles: [{ numero, papel, nombre, paga }],   // botones verdes
 *   tieneFijo,                                     // sin móvil pero con algún fijo
 *   fijo,                                          // ese fijo, para decirlo
 *   destino: 'nueva'|'phone'|'mobile'|'sustituye',   // ver destinoDelTelefonoNuevo
 *   movilActual,                                   // el que pisaría un 'sustituye'
 * }]
 */
export const ladosDelEnvio = (stop, clientes) => {
    if (!stop) return [];
    const esRecogida = stop.type === 'Recogida';
    const pagador = quienPagaElPorte(stop);

    // 'client' es el nombre suelto del albarán: solo vale como respaldo en la punta
    // que es la parada, que es de la que habla ese campo.
    const lados = [
        {
            papel: 'Remitente',
            nombre: stop.originName || (esRecogida ? stop.client : '') || '',
            telefono: stop.originPhone,
        },
        {
            papel: 'Destinatario',
            nombre: (stop.destinationName || !esRecogida) ? nombreDestinatarioEnRuta(stop, clientes) : '',
            telefono: stop.destinationPhone,
        },
    ];
    if (!esRecogida) lados.reverse();

    const vistos = new Map();
    return lados.map(lado => {
        const paga = lado.papel === pagador;
        const telefonos = telefonosDelContacto(lado.nombre, lado.telefono, clientes);
        const moviles = [];
        telefonos.filter(t => !t.esFijo).forEach(({ numero }) => {
            const clave = claveDeTelefono(numero);
            const yaEsta = vistos.get(clave);
            if (yaEsta) {
                // El mismo número en las dos puntas (remitente y destinatario son la
                // misma empresa) es un solo botón, el de la punta que va delante. Pero
                // si quien paga es la otra punta, ese botón paga igual: es el mismo
                // teléfono, y esconderle el precio sería esconderle SU propia factura.
                if (paga) yaEsta.paga = true;
                return;
            }
            // 'paga' decide si a este contacto se le manda el precio del porte
            // (ver lineasDeDineroDelJustificante): los datos del cobro son para
            // quien lo paga, al otro se le manda el justificante sin ellos.
            const opcion = { numero, papel: lado.papel, nombre: lado.nombre, paga };
            vistos.set(clave, opcion);
            moviles.push(opcion);
        });
        const fijo = telefonos.find(t => t.esFijo)?.numero || '';
        const ficha = telefonosDeLaFicha(lado.nombre, clientes);
        return {
            papel: lado.papel,
            nombre: lado.nombre,
            paga,
            moviles,
            tieneFijo: !!fijo,
            fijo,
            destino: destinoDelTelefonoNuevo(ficha),
            movilActual: ficha?.mobile || '',
        };
    });
};

// Solo los botones: los móviles de las dos puntas, la parada delante.
export const movilesDelEnvio = (stop, clientes) =>
    ladosDelEnvio(stop, clientes).flatMap(lado => lado.moviles);
