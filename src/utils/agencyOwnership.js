// ══════════════════════════════════════════════════════════════════════════
// PERTENENCIA DE FICHAS: base de datos propia vs. base de datos de agencia
// ══════════════════════════════════════════════════════════════════════════
// SUM trabaja para 3 agencias de transporte (TSB, TXT, XPO) que le entregan
// mercancía para sus propios destinatarios. Esos destinatarios NO son clientes
// de SUM: el día que se deje de trabajar con una agencia hay que poder borrarlos
// en bloque sin tocar la cartera propia.
//
// Cada ficha lleva `ownerAgencyId`:
//   - null/undefined → ficha propia (comportamiento de siempre)
//   - id de una ficha con `isAgency: true` → pertenece a esa agencia
//
// Una ficha sólo puede estar en UNA bolsa. Si un destinatario ya es cliente de
// SUM y una agencia le manda mercancía, la ficha sigue siendo propia: se reutiliza
// (con su tarifa, su GPS y su nº de cliente) y no se duplica ni cambia de dueño.
// Por eso la asignación automática sólo actúa al CREAR fichas nuevas.

const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/** Fichas marcadas como agencia de transporte. */
export function getAgencies(clients) {
    return (clients || []).filter(c => c && c.isAgency);
}

/**
 * Quién paga el porte de un albarán.
 * Porte Debido → paga el destinatario. Porte Pagado → paga el remitente.
 */
export function getPayerName(shipment) {
    if (!shipment) return '';
    return shipment.porteType === 'Debido'
        ? (shipment.destinationName || '')
        : (shipment.client || '');
}

/**
 * Busca la agencia que responde a ese nombre, mirando también razones sociales
 * y sedes (una agencia puede facturar desde una delegación).
 */
export function findAgencyByName(name, clients) {
    const target = normalize(name);
    if (!target) return null;

    for (const agency of getAgencies(clients)) {
        if (normalize(agency.name) === target) return agency;
        if (normalize(agency.legalName) === target) return agency;
        if (Array.isArray(agency.branches) && agency.branches.some(b => normalize(b.name) === target)) {
            return agency;
        }
    }
    return null;
}

/**
 * Agencia a la que pertenecen las fichas nuevas nacidas de este albarán,
 * o null si el albarán es trabajo propio de SUM.
 */
export function resolveOwnerAgencyId(shipment, clients) {
    const agency = findAgencyByName(getPayerName(shipment), clients);
    return agency ? agency.id : null;
}

/**
 * Etiqueta de la bolsa a la que pertenece una ficha, para pintarla en las listas.
 * Devuelve siempre algo mostrable aunque la agencia ya no exista.
 */
export function getOwnerLabel(client, clients) {
    if (!client || !client.ownerAgencyId) return 'MÍO';
    const agency = (clients || []).find(c => String(c.id) === String(client.ownerAgencyId));
    return agency ? (agency.name || 'AGENCIA') : 'AGENCIA BORRADA';
}

/** Fichas que se borrarían al dar de baja una agencia (su bolsa, sin su propia ficha). */
export function getClientsOwnedBy(agencyId, clients) {
    return (clients || []).filter(c =>
        c && String(c.ownerAgencyId) === String(agencyId) && String(c.id) !== String(agencyId)
    );
}

/** Reparto actual de la cartera: cuántas fichas hay en cada bolsa. */
export function getOwnershipCounts(clients) {
    const counts = { own: 0, byAgency: {} };
    for (const c of (clients || [])) {
        if (!c) continue;
        if (c.ownerAgencyId) {
            const key = String(c.ownerAgencyId);
            counts.byAgency[key] = (counts.byAgency[key] || 0) + 1;
        } else {
            counts.own += 1;
        }
    }
    return counts;
}

/**
 * INFORME de reparto para las fichas que ya existen (no escribe nada).
 *
 * Recorre el histórico de albaranes y propone mover a la bolsa de una agencia
 * las fichas cuyos albaranes SIEMPRE los pagó esa agencia. Si una ficha tiene
 * aunque sea un albarán de trabajo propio, o la reclaman dos agencias distintas,
 * se queda como propia: en la duda, nunca se saca nada de la cartera de SUM.
 *
 * Devuelve { proposals: [...], skipped: [...] } donde cada propuesta lleva el
 * motivo y el recuento de albaranes, para poder revisarla antes de aplicarla.
 */
export function buildOwnershipReport(clients, shipments) {
    const agencies = getAgencies(clients);
    if (agencies.length === 0) return { proposals: [], skipped: [], agencies: [] };

    const agencyIds = new Set(agencies.map(a => String(a.id)));

    // Índice nombre normalizado → ficha, incluyendo sedes y razones sociales.
    const byName = new Map();
    for (const c of (clients || [])) {
        if (!c) continue;
        for (const alias of [c.name, c.legalName]) {
            const key = normalize(alias);
            if (key && !byName.has(key)) byName.set(key, c);
        }
        if (Array.isArray(c.branches)) {
            for (const b of c.branches) {
                const key = normalize(b?.name);
                if (key && !byName.has(key)) byName.set(key, c);
            }
        }
    }

    // Por cada ficha: qué agencias la han pagado y cuántos albaranes propios tiene.
    const tally = new Map(); // clientId → { client, agencyCounts: Map, ownCount }
    const touch = (client) => {
        const key = String(client.id);
        if (!tally.has(key)) tally.set(key, { client, agencyCounts: new Map(), ownCount: 0 });
        return tally.get(key);
    };

    for (const shipment of (shipments || [])) {
        if (!shipment) continue;
        const agency = findAgencyByName(getPayerName(shipment), clients);

        // Las dos puntas del albarán heredan el mismo dueño: si la agencia paga,
        // tanto el remitente como el destinatario son gente suya.
        for (const partyName of [shipment.client, shipment.destinationName]) {
            const client = byName.get(normalize(partyName));
            if (!client) continue;
            if (agencyIds.has(String(client.id))) continue; // la propia agencia nunca se reparte

            const entry = touch(client);
            if (agency) {
                const key = String(agency.id);
                entry.agencyCounts.set(key, (entry.agencyCounts.get(key) || 0) + 1);
            } else {
                entry.ownCount += 1;
            }
        }
    }

    const proposals = [];
    const skipped = [];

    for (const { client, agencyCounts, ownCount } of tally.values()) {
        if (client.ownerAgencyId) continue;      // ya está asignada, no se toca
        if (agencyCounts.size === 0) continue;   // sólo trabajo propio, nada que proponer

        const agencyTotal = [...agencyCounts.values()].reduce((a, b) => a + b, 0);

        if (ownCount > 0) {
            skipped.push({
                client,
                reason: `Tiene ${ownCount} albarán(es) pagados por ti además de ${agencyTotal} de agencia`,
                ownCount,
                agencyTotal,
            });
            continue;
        }
        if (agencyCounts.size > 1) {
            const names = [...agencyCounts.keys()]
                .map(id => (agencies.find(a => String(a.id) === id)?.name) || id)
                .join(', ');
            skipped.push({
                client,
                reason: `La comparten varias agencias (${names})`,
                ownCount,
                agencyTotal,
            });
            continue;
        }

        const agencyId = [...agencyCounts.keys()][0];
        const agency = agencies.find(a => String(a.id) === agencyId);
        proposals.push({
            client,
            agencyId: agency ? agency.id : agencyId,
            agencyName: agency ? agency.name : agencyId,
            shipmentCount: agencyTotal,
        });
    }

    proposals.sort((a, b) => String(a.agencyName).localeCompare(String(b.agencyName))
        || String(a.client.name).localeCompare(String(b.client.name)));
    skipped.sort((a, b) => String(a.client.name).localeCompare(String(b.client.name)));

    return { proposals, skipped, agencies };
}
