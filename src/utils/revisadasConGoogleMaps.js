// ── Fichas pendientes revisadas con Google Maps el 24/09/2026 ──
//
// PROVISIONAL. Es la lista del botón «revisadas con Google Maps» de Validar
// Clientes, para aprobarlas de un tirón. Cuando estén todas aprobadas el botón
// desaparece solo (sólo cuenta las que siguen pendientes), y entonces se puede
// borrar este fichero y el botón.
//
// A todas se les buscó el negocio en Google Maps, como hace la oficina a mano, y
// se les copió la calle al domicilio. No entran las 16 a las que sólo se les
// borró el GPS malo: ésas no están comprobadas.

// El negocio sale en Google Maps a menos de 150 m del GPS del conductor: se les
// puso la calle y el GPS se dejó como estaba.
const CON_CALLE = [
    '1790076934121', '1790145628374', '1790146590087', '1790146650079', '1790003333581', '1790085146080',
    '1789977077837', '1789639829566', '1789977593840', '1790063137709', '1789971536760', '1790086575594',
    '1790086903209', '1790148864297', '1789981946521', '1790088644776', '1789371727765', '1789371972452',
    '1789978693712', '1789569281732', '1789569377038', '1790068721766', '1790059969641', '1789372572837',
    '1790090339984', '1789550415149', '1790071257586', '1789727553552', '1789975874257', '1790073927203',
    '1790091235669', '1789738453402', '1790150231140', '1790171286871', '1789467162255', '1789655530826',
    '1789739858606', '1789628533601', '1789975470167', '1790060264910', '1789465131863', '1790172900153',
    '1789377064469', '1789487837166', '1789741324769', '1789657236314', '1789660365764', '1790157134031',
    '1789566288515', '1789998816141', '1789479546272', '1789452309626', '1789480553919', '1789566569524',
    '1790174157919', '1789999845617', '1789713929920', '1789542402744', '1789567286427', '1789541503528',
    '1789745610868', '1789567540889', '1789745620730', '1789542995155', '1790000336593', '1789568256583',
    '1790151801884', '1789716911277', '1789639013534', '1790001980165', '1790002019720', '1790059201283',
    '1790002216903', '1790177027317', '1790175257945', '1790152139275',
];

// El GPS se había tomado en otro sitio (la nave de Cabra, un almacén de
// Córdoba, otro pueblo): se les puso la calle y el GPS de Google Maps.
const CON_CALLE_Y_GPS = [
    '1789380806959', '1789541848998', '1789572259711', '1789635037431', '1789726692807', '1789990816448',
    '1790091242613', '1790149436327', '1790164556012', '1790172903043', '1790176488044', '1789467517119',
    '1789655797765', '1789956493570', '1789991830436', '1790154957888',
];

const REVISADAS = new Set([...CON_CALLE, ...CON_CALLE_Y_GPS]);

export function revisadaConGoogleMaps(client) {
    return client?.id != null && REVISADAS.has(String(client.id));
}
