import { papelDelClienteEnElEnvio } from './shipmentUtils';

/**
 * JUSTIFICACIÓN LEGAL DE LA ENTREGA
 *
 * Hay clientes que no aceptan como prueba de entrega lo que vale para el resto.
 * Cuando un destinatario suyo no les paga, o hay un siniestro, su seguro les pide
 * QUIÉN se llevó el material con nombre y apellidos, número de documento y una
 * firma que se pueda atribuir a esa persona. Un "Juan" suelto y un garabato no
 * les justifican nada, y sin eso no pagan la factura del porte.
 *
 * Es una exigencia de cliente, no una norma nuestra: se activa en su ficha
 * ("Justificación legal de la entrega") y sólo aprieta en sus albaranes. Al resto
 * de clientes no les cambia nada.
 *
 * Ojo con lo que esto NO hace: nadie puede decidir por una imagen si una firma es
 * la de quien dice ser. Lo que se comprueba aquí es que haya un trazo de firma de
 * verdad y no un punto ni una raya; lo que de verdad ata la entrega a una persona
 * es el documento, y por eso ahí sí se valida la letra del DNI/NIE.
 */

/** Letras de control del DNI/NIE, en el orden oficial (resto de dividir entre 23). */
const LETRAS_CONTROL = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Puntos mínimos del trazo para que no cuele un toque con el dedo. */
const MIN_PUNTOS_FIRMA = 12;
/** Anchura mínima del trazo, en píxeles del recuadro de firma. */
const MIN_ANCHO_FIRMA = 60;
/** Altura mínima: una raya horizontal de lado a lado no es una firma. */
const MIN_ALTO_FIRMA = 15;

/**
 * Si este albarán es de un cliente que exige la justificación completa.
 *
 * Se mira la ficha VIVA del cliente, no la copia de reglas que el albarán se lleva
 * congelada al crearse (`deliveryRules`). Si no, activar el interruptor hoy no
 * serviría para lo que ya está en la calle, que es justo lo que el cliente está
 * reclamando.
 *
 * Vale tanto si el cliente es el remitente como si es el destinatario: el que
 * manda el material quiere justificar quién lo recibió, y el que lo recibe quiere
 * justificar quién se lo llevó de su almacén.
 */
export const exigeJustificacionLegal = (shipment, clients = []) => {
    if (!shipment) return false;
    return (clients || []).some(
        (cliente) => cliente && cliente.requireLegalProof && papelDelClienteEnElEnvio(shipment, cliente) !== null
    );
};

/**
 * Nombre y apellidos, no un nombre de pila suelto.
 *
 * Se piden dos palabras de dos letras para arriba. Así pasa "Juan Gil" y no pasan
 * "Juan", "J. Gil" ni una inicial suelta. Los números y los signos no cuentan como
 * letras, para que "Juan 2" tampoco cuele.
 */
export const nombreCompletoValido = (nombre) => {
    const palabras = String(nombre || '')
        .trim()
        .split(/\s+/)
        .filter((palabra) => palabra.replace(/[^\p{L}]/gu, '').length >= 2);
    return palabras.length >= 2;
};

/**
 * Documento de identidad utilizable para justificar la entrega.
 *
 * Al DNI y al NIE se les comprueba la letra: es lo que impide que se cierre una
 * entrega con "00000000" o con un número inventado a la carrera en la puerta.
 * Para pasaportes y documentos extranjeros no hay letra que comprobar, así que se
 * acepta cualquier documento de 6 caracteres o más que mezcle letras y números
 * (ahí también entra el CIF cuando quien recibe firma como empresa).
 */
export const documentoIdentidadValido = (documento) => {
    const limpio = String(documento || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!limpio) return false;

    const dni = limpio.match(/^(\d{8})([A-Z])$/);
    if (dni) return LETRAS_CONTROL[parseInt(dni[1], 10) % 23] === dni[2];

    const nie = limpio.match(/^([XYZ])(\d{7})([A-Z])$/);
    if (nie) {
        const numero = parseInt(String('XYZ'.indexOf(nie[1])) + nie[2], 10);
        return LETRAS_CONTROL[numero % 23] === nie[3];
    }

    return limpio.length >= 6 && /[A-Z]/.test(limpio) && /\d/.test(limpio);
};

/**
 * Si lo dibujado en el recuadro es una firma y no un garabato de trámite.
 *
 * Recibe los trazos tal y como los da el recuadro de firma (`toData()`): una lista
 * de trazos, cada uno con sus puntos. Se rechaza lo que no llega a trazo —un punto
 * con el dedo, dos toques— y la raya de lado a lado, que tiene anchura pero no
 * tiene altura.
 */
export const firmaTieneTrazo = (trazos) => {
    if (!Array.isArray(trazos) || trazos.length === 0) return false;

    let puntos = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const trazo of trazos) {
        // Según la versión del recuadro, cada trazo es una lista de puntos o un
        // objeto que los lleva dentro. Se admiten las dos formas.
        const lista = Array.isArray(trazo) ? trazo : (Array.isArray(trazo?.points) ? trazo.points : []);
        for (const punto of lista) {
            if (!punto || typeof punto.x !== 'number' || typeof punto.y !== 'number') continue;
            puntos += 1;
            if (punto.x < minX) minX = punto.x;
            if (punto.x > maxX) maxX = punto.x;
            if (punto.y < minY) minY = punto.y;
            if (punto.y > maxY) maxY = punto.y;
        }
    }

    if (puntos < MIN_PUNTOS_FIRMA) return false;
    return (maxX - minX) >= MIN_ANCHO_FIRMA && (maxY - minY) >= MIN_ALTO_FIRMA;
};

/**
 * Qué le falta a la entrega para poder justificarse, en el orden en que el
 * repartidor ve los campos en la pantalla. Devuelve la lista de fallos; vacía si
 * está todo. Se usa para avisar de uno en uno sin repetir la lógica en el modal.
 */
export const fallosDeJustificacion = ({ nombre, documento, trazosFirma }) => {
    const fallos = [];
    if (!nombreCompletoValido(nombre)) fallos.push('nombre');
    if (!documentoIdentidadValido(documento)) fallos.push('documento');
    if (!firmaTieneTrazo(trazosFirma)) fallos.push('firma');
    return fallos;
};
