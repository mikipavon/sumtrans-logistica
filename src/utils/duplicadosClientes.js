// ── ¿Esta solicitud pendiente es una empresa que ya está en cartera? ──
//
// El formulario de la web es público y no puede tocar ninguna ficha existente
// (ver la Edge Function registro-cliente), así que TODO registro entra como una
// ficha nueva, también el de un cliente de toda la vida que sólo quería el
// acceso a la app. Si se aprueba sin mirar, quedan dos fichas de la misma
// empresa y, peor, el portal del cliente se ata a la nueva —la vacía—, porque
// RLS filtra sus envíos por el vínculo de su cuenta.
//
// El registro web ya deja una pista (`possibleDuplicateOf`) cuando el CIF le
// suena, pero se queda corta en tres casos, y por eso aquí se vuelve a mirar
// contra la cartera de verdad:
//   - fichas antiguas sin CIF, o con el CIF escrito de otra forma
//   - solicitudes anteriores al 27/07/2026, que nacieron sin esa pista
//   - la misma empresa registrada con otro CIF pero el mismo correo
//
// No decide nada: sólo enseña lo que ha encontrado para que la validación sea
// con los ojos abiertos. El CIF es información pública y quien rellena el
// formulario puede no ser de esa empresa.

import { emailDeAcceso } from './clientAccess';

const normalizarTexto = (valor) => String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // acentos
    .replace(/[.\-,;:_"']/g, '')       // puntuación
    .replace(/\s+/g, ' ')
    .trim();

const normalizarCif = (valor) => String(valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// Todos los correos por los que se puede reconocer a una ficha: el de contacto,
// el de acceso al portal y el usuario cuando es un email.
const correosDe = (client) => {
    const usuario = String(client?.username || '').trim().toLowerCase();
    return [
        String(client?.email || '').trim().toLowerCase(),
        emailDeAcceso(client),
        usuario.includes('@') ? usuario : '',
    ].filter(Boolean);
};

// Devuelve las fichas de cartera que se parecen a la solicitud pendiente, con
// el motivo por el que se parecen. Más fuerte primero: CIF, correo, nombre.
export function buscarFichasParecidas(pendiente, clients = []) {
    if (!pendiente) return [];

    const cifPendiente = normalizarCif(pendiente.cif);
    const correosPendiente = correosDe(pendiente);
    const nombrePendiente = normalizarTexto(pendiente.name);
    const avisoDelRegistro = pendiente.possibleDuplicateOf;

    const encontradas = [];

    for (const client of clients) {
        if (!client || client.id === pendiente.id) continue;
        // Otra solicitud pendiente no es "estar en cartera": lo que interesa es
        // avisar de la ficha real con la que chocaría al aprobarla.
        if (client.status === 'pending' || client.isTest) continue;

        const motivos = [];

        if (cifPendiente && normalizarCif(client.cif) === cifPendiente) {
            motivos.push('el mismo CIF');
        }

        const correosClient = correosDe(client);
        if (correosPendiente.some(c => correosClient.includes(c))) {
            motivos.push('el mismo correo');
        }

        if (nombrePendiente && normalizarTexto(client.name) === nombrePendiente) {
            motivos.push('el mismo nombre');
        }

        // La pista que dejó el registro web, aunque hoy ya no coincida nada:
        // puede que la ficha se haya editado desde entonces.
        if (avisoDelRegistro != null && String(client.id) === String(avisoDelRegistro) && motivos.length === 0) {
            motivos.push('el aviso del registro web');
        }

        if (motivos.length > 0) {
            encontradas.push({
                client,
                motivos,
                // El caso delicado: si esa ficha YA entra en el portal, aprobar
                // esto es dar acceso a una empresa que ya tiene su cuenta.
                yaTieneAcceso: Boolean(client.password),
            });
        }
    }

    // Primero las que coinciden por más motivos, que son las más seguras.
    return encontradas.sort((a, b) => b.motivos.length - a.motivos.length);
}

// Texto para el aviso: "el mismo CIF y el mismo correo".
export function explicarMotivos(motivos = []) {
    if (motivos.length === 0) return '';
    if (motivos.length === 1) return motivos[0];
    return `${motivos.slice(0, -1).join(', ')} y ${motivos[motivos.length - 1]}`;
}
