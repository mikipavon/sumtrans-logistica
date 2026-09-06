/**
 * Normas de fichaje: lo que la oficina decide sobre CUÁNDO y DESDE DÓNDE cuenta
 * un fichaje de entrada.
 *
 * El problema que resuelven: la app del repartidor ficha la entrada sola al abrirse.
 * Un conductor que un sábado mira el reparto desde el sofá, o que un día que no
 * viene entra "a ver", quedaba fichado como si hubiera trabajado. Aquí se decide:
 *
 * · qué días de la semana son laborables (los demás no fichan);
 * · si el fichaje al abrir la app es automático o hay que pulsar "Empezar Jornada";
 * · una geocerca opcional: solo se ficha si el móvil está a menos de X metros de
 *   la nave. Sin GPS no se ficha solo (el conductor puede pulsar el botón).
 *
 * Los festivos de empresa (`company_blocked_days`) y las ausencias del conductor
 * (`driver_absences`) ya existían; aquí se juntan todos en una sola pregunta:
 * "¿puede fichar ahora?". Se guarda en `settings` con la clave `normasFichaje`.
 */

export const CLAVE_NORMAS_FICHAJE = 'normasFichaje';

/** 0 = domingo … 6 = sábado, como `Date#getDay`. */
export const DIAS_SEMANA = Object.freeze([
    { dia: 1, letra: 'L', nombre: 'Lunes' },
    { dia: 2, letra: 'M', nombre: 'Martes' },
    { dia: 3, letra: 'X', nombre: 'Miércoles' },
    { dia: 4, letra: 'J', nombre: 'Jueves' },
    { dia: 5, letra: 'V', nombre: 'Viernes' },
    { dia: 6, letra: 'S', nombre: 'Sábado' },
    { dia: 0, letra: 'D', nombre: 'Domingo' },
]);

export const NORMAS_FICHAJE_POR_DEFECTO = Object.freeze({
    diasLaborables: Object.freeze([1, 2, 3, 4, 5]),
    fichajeAutomatico: true,
    geocerca: Object.freeze({ activa: false, lat: null, lng: null, radioMetros: 500 }),
});

const numeroONull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Deja las normas en un objeto válido vengan como vengan (texto JSON de la nube,
 * objeto del formulario, nada). Campo a campo: lo que no se entiende vuelve a lo
 * de fábrica, para que un ajuste roto nunca deje a los móviles sin fichar.
 */
export const normalizarNormasFichaje = (valor) => {
    let bruto = valor;
    if (typeof bruto === 'string') {
        try { bruto = JSON.parse(bruto); } catch { bruto = null; }
    }
    if (!bruto || typeof bruto !== 'object') bruto = {};

    let dias = Array.isArray(bruto.diasLaborables)
        ? [...new Set(bruto.diasLaborables.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
        : null;
    if (!dias || dias.length === 0) dias = [...NORMAS_FICHAJE_POR_DEFECTO.diasLaborables];

    const fichajeAutomatico = typeof bruto.fichajeAutomatico === 'boolean'
        ? bruto.fichajeAutomatico
        : NORMAS_FICHAJE_POR_DEFECTO.fichajeAutomatico;

    const g = bruto.geocerca && typeof bruto.geocerca === 'object' ? bruto.geocerca : {};
    const lat = numeroONull(g.lat);
    const lng = numeroONull(g.lng);
    const radio = numeroONull(g.radioMetros);
    const coordenadasValidas = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const geocerca = {
        activa: g.activa === true && coordenadasValidas,
        lat: coordenadasValidas ? lat : null,
        lng: coordenadasValidas ? lng : null,
        radioMetros: radio !== null && radio > 0 ? Math.round(radio) : NORMAS_FICHAJE_POR_DEFECTO.geocerca.radioMetros,
    };

    return { diasLaborables: dias, fichajeAutomatico, geocerca };
};

/** "2026-09-05" (sábado) -> false con las normas de fábrica. */
export const esDiaLaborable = (fechaISO, normas = NORMAS_FICHAJE_POR_DEFECTO) => {
    const n = normalizarNormasFichaje(normas);
    const f = new Date(`${fechaISO}T12:00:00`);
    if (isNaN(f)) return false;
    return n.diasLaborables.includes(f.getDay());
};

/** Distancia en metros entre dos puntos {lat, lng} (haversine). */
export const distanciaMetros = (a, b) => {
    const R = 6371000;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

export const MOTIVOS_BLOQUEO = Object.freeze({
    DIA_NO_LABORABLE: 'dia_no_laborable',
    FESTIVO: 'festivo',
    AUSENCIA: 'ausencia',
    AUTOMATICO_DESACTIVADO: 'automatico_desactivado',
    SIN_GPS: 'sin_gps',
    FUERA_DE_NAVE: 'fuera_de_nave',
});

/**
 * ¿Hay jornada ese día para ese conductor? Mira el día de la semana, los festivos
 * de empresa y las ausencias. Devuelve null si hay jornada, o el motivo si no.
 * Es lo que decide si en el móvil sale el botón de fichar o un cartel de descanso.
 */
export const motivoSinJornada = ({ fechaISO, normas, festivos = [], ausencia = null }) => {
    if (!esDiaLaborable(fechaISO, normas)) return MOTIVOS_BLOQUEO.DIA_NO_LABORABLE;
    if ((festivos || []).some(f => f && f.date === fechaISO)) return MOTIVOS_BLOQUEO.FESTIVO;
    if (ausencia) return MOTIVOS_BLOQUEO.AUSENCIA;
    return null;
};

/**
 * ¿Puede la app fichar la entrada SOLA ahora mismo? Encima de `motivoSinJornada`
 * aplica el interruptor de fichaje automático y la geocerca. `posicion` es
 * {lat, lng} o null si el móvil no ha dado GPS.
 *
 * Devuelve { ok, motivo, distanciaMetros }. Con la geocerca activa y sin GPS no se
 * ficha: mejor que el conductor pulse el botón a fichar a alguien desde su casa.
 */
export const puedeFicharAutomaticamente = ({ fechaISO, normas, festivos = [], ausencia = null, posicion = null }) => {
    const n = normalizarNormasFichaje(normas);
    const sinJornada = motivoSinJornada({ fechaISO, normas: n, festivos, ausencia });
    if (sinJornada) return { ok: false, motivo: sinJornada };
    if (!n.fichajeAutomatico) return { ok: false, motivo: MOTIVOS_BLOQUEO.AUTOMATICO_DESACTIVADO };
    if (n.geocerca.activa) {
        if (!posicion || !Number.isFinite(posicion.lat) || !Number.isFinite(posicion.lng)) {
            return { ok: false, motivo: MOTIVOS_BLOQUEO.SIN_GPS };
        }
        const d = distanciaMetros(posicion, { lat: n.geocerca.lat, lng: n.geocerca.lng });
        if (d > n.geocerca.radioMetros) return { ok: false, motivo: MOTIVOS_BLOQUEO.FUERA_DE_NAVE, distanciaMetros: Math.round(d) };
        return { ok: true, motivo: null, distanciaMetros: Math.round(d) };
    }
    return { ok: true, motivo: null };
};

/** Texto corto para el conductor cuando no hay jornada. */
export const textoSinJornada = (motivo, fechaISO) => {
    if (motivo === MOTIVOS_BLOQUEO.DIA_NO_LABORABLE) {
        const nombre = DIAS_SEMANA.find(d => d.dia === new Date(`${fechaISO}T12:00:00`).getDay())?.nombre || 'Hoy';
        return `${nombre} — Día de descanso`;
    }
    if (motivo === MOTIVOS_BLOQUEO.FESTIVO) return 'Día no laborable';
    if (motivo === MOTIVOS_BLOQUEO.AUSENCIA) return 'Ausencia registrada';
    return '';
};
