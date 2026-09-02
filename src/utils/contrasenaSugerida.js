// ── Contraseñas que se puedan dictar por teléfono ──
//
// La oficina da de alta el acceso y se lo tiene que decir al cliente, muchas
// veces hablando. Una contraseña aleatoria de símbolos (`x7#Qm!2v`) es un
// suplicio por teléfono: se confunde la be con la uve, el cero con la o, y
// acaba en tres llamadas y una contraseña nueva.
//
// De ahí este formato: palabras normales pegadas y cuatro dígitos.
//   PLUMA + BARCO + NIEVE + 4738        →  PlumaBarcoNieve4738
//   PROSERVICE + BARCO + NIEVE + 4738   →  ProserviceBarcoNieve4738
// Cuando hay nombre comercial, éste ocupa el sitio de la primera palabra: así
// se ve de quién es sin abrir nada. Pero NO sustituye al azar, sólo etiqueta:
// el nombre es público (va en facturas y albaranes), así que no esconde nada.
// Lo que la hace difícil de adivinar son las palabras y las cifras aleatorias.
// Se lee en voz alta sin deletrear nada, se escribe de corrido, y como la
// combinación es aleatoria no aparece en ninguna lista de contraseñas
// filtradas — que es lo que hace que Supabase rechace `123456`, `16321632` y
// cualquier cosa "fácil" que se le ocurra a nadie.
//
// Por qué NO una compartida para todos los clientes: los correos de los
// clientes no son secretos (van en albaranes y facturas), así que una clave
// común convierte cada portal en la puerta de todos los demás — sus precios,
// sus envíos y sus destinatarios incluidos.

// Palabras sin tildes, sin ñ y sin parejas que se confundan al oído (nada de
// "vaca"/"baca"). Entre 4 y 6 letras, para que la contraseña no se dispare de
// largo. El tamaño de la lista importa: son las combinaciones posibles.
const PALABRAS = [
    'arbol', 'arena', 'arroz', 'aula', 'ave', 'avion', 'ayuda',
    'banco', 'barco', 'barro', 'bosque', 'bote', 'brisa', 'bronce', 'buho',
    'cabra', 'cable', 'caja', 'calle', 'cama', 'campo', 'canto', 'carro',
    'casa', 'cesta', 'cielo', 'cinta', 'ciudad', 'clavo', 'cobre', 'cocina',
    'codo', 'cofre', 'colina', 'collar', 'copa', 'corcho', 'cordel', 'coro',
    'corte', 'costa', 'crema', 'cresta', 'cruce', 'cuadro', 'cuerda', 'cueva',
    'dedo', 'delta', 'diente', 'disco', 'duna',
    'embudo', 'enero', 'equipo', 'escoba', 'espejo', 'estufa',
    'faro', 'fecha', 'ficha', 'fiesta', 'flecha', 'flor', 'foca', 'fondo',
    'forma', 'fresa', 'fruta', 'fuego', 'fuente',
    'gancho', 'ganso', 'garaje', 'globo', 'golfo', 'gorra', 'grano', 'granja',
    'grieta', 'grifo', 'grupo', 'guante', 'guitarra',
    'harina', 'hebilla', 'hielo', 'hierro', 'hilo', 'hoja', 'horno', 'huerto',
    'humo',
    'iglesia', 'imagen', 'isla',
    'jardin', 'jarra', 'jaula', 'juego', 'jueves', 'jugo',
    'ladrillo', 'lago', 'lamina', 'lampara', 'lanza', 'lapiz', 'leche',
    'lente', 'letra', 'libro', 'lima', 'limon', 'linea', 'llave', 'lluvia',
    'lobo', 'losa', 'luna',
    'madera', 'maiz', 'malla', 'manta', 'marco', 'marea', 'martes', 'masa',
    'mesa', 'metal', 'metro', 'miel', 'mina', 'monte', 'mora', 'motor',
    'muelle', 'muro', 'museo',
    'naranja', 'nido', 'niebla', 'nieve', 'nube', 'nudo', 'nuez',
    'olivo', 'olla', 'onda', 'oro', 'oso', 'otono',
    'pala', 'palma', 'pared', 'parque', 'pasta', 'patio', 'pato', 'pecera',
    'pelota', 'perla', 'pesca', 'piedra', 'pila', 'pino', 'pinza', 'pipa',
    'pista', 'pizarra', 'planta', 'plata', 'playa', 'pluma', 'polea', 'polvo',
    'pomo', 'pozo', 'prado', 'presa', 'puente', 'puerta', 'pulpo', 'punta',
    'queso',
    'rama', 'rampa', 'rana', 'rastro', 'raton', 'rayo', 'recodo', 'red',
    'reja', 'reloj', 'remo', 'resina', 'revista', 'riego', 'rincon', 'rio',
    'roble', 'roca', 'rueda', 'ruta',
    'sabana', 'sal', 'sala', 'salto', 'sastre', 'seda', 'selva', 'sierra',
    'silla', 'sobre', 'sofa', 'sol', 'sombra', 'sopa', 'suelo', 'surco',
    'tabla', 'taller', 'tapa', 'taza', 'techo', 'tela', 'tienda', 'tierra',
    'tigre', 'tinta', 'toldo', 'torre', 'trigo', 'tubo', 'tulipan',
    'uva',
    'valle', 'vapor', 'vaso', 'vela', 'ventana', 'verano', 'vidrio', 'viento',
    'vino', 'viga',
    'yema', 'yeso',
    'zanja', 'zapato', 'zorro', 'zumo',
];

// Al azar de verdad. Math.random() no sirve para una contraseña: es predecible
// y aquí lo que se genera es la llave del portal de un cliente.
function alAzar(tope) {
    const buffer = new Uint32Array(1);
    // Se descarta el sobrante para que todos los valores salgan igual de veces
    // (con un módulo pelado, los primeros de la lista tocarían más).
    const limite = Math.floor(0xFFFFFFFF / tope) * tope;
    let valor;
    do {
        crypto.getRandomValues(buffer);
        valor = buffer[0];
    } while (valor >= limite);
    return valor % tope;
}

const conMayuscula = (palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1);

export const PALABRAS_POR_CONTRASENA = 3;
export const DIGITOS_POR_CONTRASENA = 4;

// Formas jurídicas y palabras de relleno: como nombre no distinguen nada, y
// dejarlas dentro daría contraseñas que empiezan todas por "Sl" o por "De".
const RELLENO = new Set([
    'sl', 'sa', 'slu', 'sll', 'slne', 'cb', 'sc', 'scp', 'coop', 'sat',
    'sociedad', 'limitada', 'anonima', 'civil', 'srl', 'sas',
    'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'para', 'por',
]);

/**
 * Saca del nombre comercial un trozo que sirva como primera palabra.
 *
 * Le quita tildes y eñes y se queda con la primera palabra con sustancia, hasta
 * 12 letras: la contraseña se dicta por teléfono y se escribe a mano, así que
 * "VWG PROSERVICE, S.L." tiene que acabar en algo como `Proservice`.
 *
 * Devuelve '' si del nombre no se puede sacar nada aprovechable, y entonces la
 * contraseña se genera entera al azar, como siempre.
 */
export function nombreParaContrasena(nombre) {
    // Vocal a vocal en vez de rangos Unicode: es castellano, son siete casos
    // contados, y así se ve de un vistazo qué entra y qué no.
    const limpio = String(nombre || '')
        .toLowerCase()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/ñ/g, 'n')
        .replace(/ç/g, 'c');

    // La MÁS LARGA, no la primera: en "VWG PROSERVICE, S.L." la primera es
    // "vwg", unas siglas que no le dicen nada a nadie, y la que identifica a la
    // empresa es "proservice". En empate gana la que aparece antes.
    const candidata = limpio
        .split(/[^a-z]+/)
        .filter(p => p.length >= 3 && !RELLENO.has(p))
        .reduce((mejor, p) => (p.length > mejor.length ? p : mejor), '');

    return candidata ? conMayuscula(candidata.slice(0, 12)) : '';
}

/**
 * Devuelve una contraseña nueva, lista para dictar por teléfono.
 *
 *   generarContrasena()                    → `PlumaBarcoNieve4738`
 *   generarContrasena('VWG PROSERVICE SL') → `ProserviceBarcoNieve4738`
 *
 * Con nombre comercial, éste ocupa el sitio de la primera palabra: se reconoce
 * de quién es de un vistazo. Lo que NO hace es sustituir al azar — el nombre es
 * público (va en facturas y albaranes), así que no esconde nada; sólo etiqueta.
 * Las dos palabras y las cuatro cifras siguen siendo aleatorias, que es de donde
 * sale de verdad la dificultad para adivinarla.
 *
 * Las palabras nunca se repiten entre sí: repetida se oye mal al dictarla
 * ("barco barco nieve") y encima resta combinaciones.
 */
export function generarContrasena(nombreComercial = '') {
    const etiqueta = nombreParaContrasena(nombreComercial);
    const cuantasPalabras = etiqueta ? PALABRAS_POR_CONTRASENA - 1 : PALABRAS_POR_CONTRASENA;

    const elegidas = [];
    while (elegidas.length < cuantasPalabras) {
        const palabra = PALABRAS[alAzar(PALABRAS.length)];
        if (!elegidas.includes(palabra)) elegidas.push(palabra);
    }

    let digitos = '';
    for (let i = 0; i < DIGITOS_POR_CONTRASENA; i++) digitos += String(alAzar(10));

    return etiqueta + elegidas.map(conMayuscula).join('') + digitos;
}

// Sólo para las pruebas y para poder decir en pantalla cuántas combinaciones hay.
export const TAMANO_DEL_VOCABULARIO = PALABRAS.length;
