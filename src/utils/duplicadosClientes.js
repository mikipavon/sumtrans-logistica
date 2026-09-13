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

import { correosDeAcceso, tieneAccesoAlPortal } from './clientAccess';
import { leerReceptores, juntarReceptores, normalizarNombreReceptor } from './receptoresHabituales';
import { correosDeFicha } from './correosDeFicha';

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
// los de acceso al portal —el principal y los adicionales, que son cuentas de
// personas distintas de la misma empresa— y el usuario cuando es un email.
const correosDe = (client) => {
    const usuario = String(client?.username || '').trim().toLowerCase();
    return [
        // Todos los de la ficha, no la lista como una cadena: si la ficha
        // guarda 'compras@x.com ; almacen@x.com' y el que se registra por la
        // web es almacen@x.com, tiene que saltar el aviso de duplicado.
        ...correosDeFicha(client?.email),
        ...correosDeAcceso(client),
        usuario.includes('@') ? usuario : '',
    ].filter(Boolean);
};

// ── Nombres que se parecen sin llegar a ser el mismo ──
//
// Comparar los nombres letra a letra deja pasar lo más común: que a una ficha le
// sobre el "S.L.", que una lleve el plural y la otra no, o que las palabras
// vayan en otro orden. Para la pantalla, "Transportes Garcia" y "Transportes
// Garcia S.L." eran dos empresas distintas. Y las fichas que nacen de un albarán
// no traen ni CIF ni correo: el nombre es lo único por lo que reconocerlas.
//
// Esto SÓLO AVISA. Nunca junta ni borra nada, y a propósito no entra en
// buscarSolicitudesGemelas, que es la que alimenta el botón de unir —ése borra
// fichas y necesita una coincidencia segura—. Un parecido no es una certeza:
// "Bar Manolo" y "Bar Manolo 2" pueden ser dos locales de verdad, así que quien
// decide es el que mira los dos nombres.

// La forma jurídica no distingue a nadie: la misma empresa se escribe con ella y
// sin ella según quién teclee.
const FORMAS_JURIDICAS = new Set([
    'sl', 'sll', 'slu', 'slne', 'sa', 'sau', 'sat', 'sc', 'scp', 'scv',
    'scoop', 'coop', 'cb', 'srl', 'sociedad', 'limitada', 'anonima',
    'unipersonal', 'cooperativa',
]);

// Palabras de unión: no ayudan a reconocer la empresa y son las que más bailan.
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'al', 'a']);

// Lo que la oficina escribe de las dos maneras.
const ABREVIATURAS = {
    hnos: 'hermanos', hno: 'hermano', hnas: 'hermanas', hna: 'hermana',
    cia: 'compania', sdad: 'sociedad', dpto: 'departamento',
};

// Singular y plural tienen que caer en la misma palabra: "Talleres Ruiz" y
// "Taller Ruiz", "Autoservicio El Arco" y "Autoservicios El Arco". El plural
// castellano es de dos formas —"transporte→transportes" y "taller→talleres"— y
// desde la palabra ya escrita no se sabe cuál es, así que se recorta de más y a
// las dos por igual: "transportes" y "transporte" acaban las dos en
// "transport", y "talleres" y "taller" en "taller". No es una palabra de
// verdad, y da igual: sólo hace falta que las dos lleguen al mismo sitio.
const enSingular = (palabra) => {
    let p = palabra;
    if (p.length > 3 && p.endsWith('s')) p = p.slice(0, -1);
    if (p.length > 4 && p.endsWith('e')) p = p.slice(0, -1);
    return p;
};

// Palabras que dicen a qué se dedica, no quién es. Sirven para no dar por
// parecidas a dos empresas cuyo único punto en común es "transportes". Se
// guardan ya recortadas, para poder escribirlas aquí como se dicen.
const PALABRAS_DEL_RAMO = new Set([
    'transporte', 'comercial', 'distribucion', 'suministro', 'taller', 'bar',
    'cafe', 'restaurante', 'mueble', 'almacen', 'grupo', 'hermano', 'hermana',
    'hijo', 'construccion', 'servicio', 'autoservicio', 'electricidad',
    'logistica', 'industrial', 'industria', 'empresa', 'compania', 'tienda',
    'pintura', 'recambio', 'neumatico', 'obra', 'reforma', 'instalacion',
    'material', 'asesoria', 'gestoria', 'clinica', 'hotel', 'supermercado',
    'exclusiva', 'promocion', 'montaje', 'decoracion', 'climatizacion',
].map(enSingular));

// Los oficios acabados en -ería son una familia entera —floristería,
// ferretería, panadería, carnicería, peluquería, cristalería…— y no hay lista
// que los tenga todos: se reconocen por la terminación. Cortas no, que ahí
// caerían nombres como "Iberia".
const esDelRamo = (palabra) => PALABRAS_DEL_RAMO.has(palabra)
    || (palabra.length > 6 && palabra.endsWith('eria'));

// Las palabras con las que se reconoce a una empresa, ya limpias. Se exporta
// para poder probarla suelta.
export function clavesDelNombre(valor) {
    const palabras = normalizarTexto(valor)
        .split(' ')
        .map(p => p.replace(/[^a-z0-9]/g, ''))   // paréntesis, barras, símbolos
        .filter(Boolean)
        .map(p => ABREVIATURAS[p] || p)
        .map(enSingular)
        .filter(p => !PALABRAS_VACIAS.has(p) && !FORMAS_JURIDICAS.has(p));
    return new Set(palabras);
}

// Cuántas letras hay que cambiar para pasar de una palabra a la otra.
const letrasDeDiferencia = (a, b) => {
    if (a === b) return 0;
    const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let esquina = fila[0];
        fila[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const guardado = fila[j];
            fila[j] = Math.min(
                fila[j] + 1,                                        // borrar
                fila[j - 1] + 1,                                    // añadir
                esquina + (a[i - 1] === b[j - 1] ? 0 : 1),          // cambiar
            );
            esquina = guardado;
        }
    }
    return fila[b.length];
};

// Una errata de teclado: "Gomez" y "Gomes", "Martinez" y "Martines". En palabras
// cortas no se mira, que ahí una letra ya cambia el apellido: "Ruiz" y "Diaz"
// son dos empresas distintas y sólo se llevan cuatro letras.
const esUnaErrata = (unaPalabra, otraPalabra) => {
    const largo = Math.max(unaPalabra.length, otraPalabra.length);
    if (largo < 5) return false;
    return letrasDeDiferencia(unaPalabra, otraPalabra) <= (largo >= 8 ? 2 : 1);
};

// Lo que comparten, ¿dice quién es la empresa, o sólo a qué se dedica y dónde
// está? En un pueblo entero de fichas, el ramo y el nombre del pueblo los
// comparte medio listado: "Floristeria de la Rambla" y "Floristeria Santa Maria
// de la Rambla" son dos floristerías distintas de La Rambla, y lo único que
// tienen en común es justo eso. Así que hace falta al menos una palabra que sea
// de la empresa y de nadie más.
const identificaALaEmpresa = (compartidas, esDelLugar) => compartidas
    .some(p => !esDelRamo(p) && !esDelLugar(p));

// La comparación de verdad, ya con las palabras sacadas. Va aparte de
// nombresSeParecen porque sacarlas es lo caro —quitar acentos, partir, recortar
// plurales— y en esta pantalla cada nombre se compara con cientos: se limpia una
// vez por ficha (ver prepararFicha) y aquí ya sólo se cruzan las listas.
//
// `esDelLugar` dice si una palabra es el pueblo de alguna de las dos fichas. Es
// una función y no un conjunto para no tener que fundir los dos pueblos en uno
// nuevo por cada pareja.
function clavesSeParecen(unas, otras, esDelLugar) {
    if (unas.size === 0 || otras.size === 0) return false;

    const compartidas = [...unas].filter(p => otras.has(p));

    // Las mismas palabras, en otro orden o con la forma jurídica de más:
    // "Panaderia La Espiga" y "La Espiga Panaderia", "Cafe Central" y
    // "CAFE CENTRAL S.L".
    if (compartidas.length === unas.size && compartidas.length === otras.size) return true;

    // A una le sobra algo: "Bar Manolo" y "Bar Manolo 2", "Muebles Lopez" y
    // "Muebles Lopez (Sevilla)".
    const laCorta = unas.size <= otras.size ? unas : otras;
    if (compartidas.length === laCorta.size && identificaALaEmpresa(compartidas, esDelLugar)) return true;

    // Todo igual menos una palabra, y esa por una errata: "Ferreteria Gomez" y
    // "Ferreteria Gomes". Aquí no se mira si lo compartido identifica a la
    // empresa —en este ejemplo lo común es justo el ramo—, porque el peso lo
    // lleva la palabra que baila: tiene que ser larga y casi la misma.
    if (unas.size === otras.size && compartidas.length === unas.size - 1) {
        const sobraDeUna = [...unas].filter(p => !otras.has(p));
        const sobraDeOtra = [...otras].filter(p => !unas.has(p));
        if (sobraDeUna.length === 1 && sobraDeOtra.length === 1) {
            return esUnaErrata(sobraDeUna[0], sobraDeOtra[0]);
        }
    }

    return false;
}

// `delLugar` son las palabras de la población de las fichas que se comparan (ver
// algunNombreSeParece). Va aparte y no dentro de PALABRAS_DEL_RAMO porque
// depende de quién se compare con quién: "Espejo" es el pueblo en una ficha de
// Espejo y puede ser el apellido de la empresa en una de Córdoba.
export function nombresSeParecen(unNombre, otroNombre, delLugar = new Set()) {
    return clavesSeParecen(
        clavesDelNombre(unNombre),
        clavesDelNombre(otroNombre),
        (palabra) => delLugar.has(palabra),
    );
}

// La ficha puede llamarse de una manera y facturar con otra: se cruzan las dos.
const nombresDe = (client) => [client?.name, client?.legalName]
    .filter(v => String(v || '').trim() !== '');

// ── Lo que cuesta caro de una ficha, hecho una sola vez ──
//
// Buscar duplicados es comparar cada solicitud con cada ficha: con 100
// pendientes y 1.500 clientes son 150.000 parejas. Lo caro no era la
// comparación, era lo que se repetía ANTES de cada una —quitarle los acentos al
// nombre, partirlo en palabras, recortar los plurales, separar los correos del
// campo E-mail—, que salía casi un millón de veces para dar siempre lo mismo.
// La pantalla se quedaba parada segundo y medio al entrar, y otro tanto cada vez
// que se guardaba un cliente.
//
// Aquí cada ficha se limpia UNA vez y se compara ya limpia.
function prepararFicha(client) {
    return {
        client,
        cif: normalizarCif(client?.cif),
        correos: correosDe(client),
        nombre: normalizarTexto(client?.name),
        legal: normalizarTexto(client?.legalName),
        // Las palabras del nombre y las de la razón social, para cruzarlas.
        nombres: nombresDe(client).map(n => clavesDelNombre(n)),
        // El pueblo, en palabras: basta con que "Rambla" sea el pueblo de una
        // para que deje de valer como apellido de la otra, y muchas fichas de
        // albarán vienen sin población.
        ciudad: clavesDelNombre(client?.city),
    };
}

// La lista entera preparada, guardada del propio array que llega. Es el array de
// clientes que tiene React en la mano: mientras no cambie —y sólo cambia al
// guardar algo— las tres búsquedas de la pantalla se lo encuentran ya hecho en
// vez de rehacerlo cada una por su cuenta.
//
// Ojo: lo que se guarda es el resultado de mirar esas fichas TAL COMO ESTABAN.
// Si algún día alguien le cambiara el nombre o el correo a un cliente sin
// rehacer el array, aquí se seguiría viendo el de antes. La aplicación nunca
// toca una ficha por dentro —siempre crea un array nuevo—, y de eso depende.
const listasPreparadas = new WeakMap();

function prepararLista(clients) {
    if (!Array.isArray(clients)) return [];
    const guardada = listasPreparadas.get(clients);
    if (guardada) return guardada;
    const preparada = clients.map(c => prepararFicha(c));
    listasPreparadas.set(clients, preparada);
    return preparada;
}

// ¿Se parecen los nombres de dos fichas ya preparadas?
const fichasSeParecen = (una, otra) => {
    const esDelLugar = (palabra) => una.ciudad.has(palabra) || otra.ciudad.has(palabra);
    return una.nombres.some(unas => otra.nombres.some(otras => clavesSeParecen(unas, otras, esDelLugar)));
};

export const algunNombreSeParece = (unaFicha, otraFicha) =>
    fichasSeParecen(prepararFicha(unaFicha), prepararFicha(otraFicha));

// El motivo flojo: avisa, pero no habilita nada que borre ni dé accesos.
export const PARECIDO_DE_NOMBRE = 'un nombre casi igual';

// Devuelve las fichas de cartera que se parecen a la solicitud pendiente, con
// el motivo por el que se parecen. Más fuerte primero: CIF, correo, nombre.
export function buscarFichasParecidas(pendiente, clients = []) {
    if (!pendiente) return [];

    const laPendiente = prepararFicha(pendiente);
    const avisoDelRegistro = pendiente.possibleDuplicateOf;

    const encontradas = [];

    for (const laOtra of prepararLista(clients)) {
        const client = laOtra.client;
        if (!client || client.id === pendiente.id) continue;
        // Otra solicitud pendiente no es "estar en cartera": lo que interesa es
        // avisar de la ficha real con la que chocaría al aprobarla.
        if (client.status === 'pending' || client.isTest) continue;

        const motivos = [];

        if (laPendiente.cif && laOtra.cif === laPendiente.cif) {
            motivos.push('el mismo CIF');
        }

        if (laPendiente.correos.some(c => laOtra.correos.includes(c))) {
            motivos.push('el mismo correo');
        }

        if (laPendiente.nombre && laOtra.nombre === laPendiente.nombre) {
            motivos.push('el mismo nombre');
        } else if (fichasSeParecen(laPendiente, laOtra)) {
            motivos.push(PARECIDO_DE_NOMBRE);
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
                yaTieneAcceso: tieneAccesoAlPortal(client),
                // Sin nada que lo confirme —ni CIF, ni correo, ni el nombre
                // entero—: sólo se parecen. Vale para avisar, no para darle a
                // esa ficha el acceso al portal, que sería meter a una empresa
                // en los envíos de otra.
                soloPorParecido: !motivos.some(m => m !== PARECIDO_DE_NOMBRE),
            });
        }
    }

    // Primero las seguras, y entre ellas las que coinciden por más motivos. Las
    // que sólo se parecen van al final: son las que menos hay que creerse.
    return encontradas.sort((a, b) => (Number(a.soloPorParecido) - Number(b.soloPorParecido))
        || (b.motivos.length - a.motivos.length));
}

// Texto para el aviso: "el mismo CIF y el mismo correo".
export function explicarMotivos(motivos = []) {
    if (motivos.length === 0) return '';
    if (motivos.length === 1) return motivos[0];
    return `${motivos.slice(0, -1).join(', ')} y ${motivos[motivos.length - 1]}`;
}

// ── Solicitudes pendientes que son la misma empresa ──
//
// Lo de arriba mira contra la cartera, y a propósito salta lo que está
// pendiente: para avisar de "esto ya lo tienes" la otra solicitud no cuenta.
// Pero en Validar Clientes el problema es justo el otro: la misma empresa
// aparecía dos y tres veces seguidas, porque cada camino de alta creaba la suya
// —el albarán una, la entrega otra, el reparto otra— y ninguna sabía de las
// demás. Salían tarjetas a medias: una con coordenadas y sin teléfono, otra al
// revés, y había que aprobar a ojo.
//
// Ya no deberían nacer duplicadas (ver altaClientes.js y handleAddClient), pero
// las que se crearon antes siguen ahí y hay que poder juntarlas.
export function buscarSolicitudesGemelas(pendiente, pendientes = []) {
    if (!pendiente) return [];

    const { nombre, legal, cif, correos } = prepararFicha(pendiente);

    return prepararLista(pendientes)
        .filter(laOtra => {
            const otra = laOtra.client;
            if (!otra || otra.id === pendiente.id || otra.isTest) return false;

            // Por nombre o razón social: es lo único que traen las fichas que
            // nacen de un albarán, que no tienen ni CIF ni correo.
            if (nombre && (laOtra.nombre === nombre || laOtra.legal === nombre)) return true;
            if (legal && (laOtra.nombre === legal || laOtra.legal === legal)) return true;

            if (cif && laOtra.cif === cif) return true;

            if (correos.some(c => laOtra.correos.includes(c))) return true;

            return false;
        })
        .map(laOtra => laOtra.client);
}

// ── Solicitudes pendientes que sólo se PARECEN ──
//
// Aparte, y no dentro de buscarSolicitudesGemelas, a propósito: las gemelas
// alimentan el botón de unir, que borra las otras fichas, y para borrar hace
// falta una coincidencia segura. Esto es más flojo —un nombre parecido— así que
// se queda en aviso: se enseñan las dos y decide quien las mira. Si de verdad
// son la misma, con igualar el nombre pasan a ser gemelas y ya se pueden unir.
export function buscarSolicitudesParecidas(pendiente, pendientes = []) {
    if (!pendiente) return [];

    // Lo que ya salta como gemela no se repite aquí: sería el mismo aviso dos
    // veces, uno con botón de unir y otro sin él.
    const gemelas = new Set(buscarSolicitudesGemelas(pendiente, pendientes).map(g => g.id));
    const laPendiente = prepararFicha(pendiente);

    return prepararLista(pendientes)
        .filter(laOtra => {
            const otra = laOtra.client;
            if (!otra || otra.id === pendiente.id || otra.isTest) return false;
            if (gemelas.has(otra.id)) return false;
            return fichasSeParecen(laPendiente, laOtra);
        })
        .map(laOtra => laOtra.client);
}

// Qué aporta cada gemela que la principal no tenga. Sirve para dos cosas: para
// enseñar en la tarjeta por qué merece la pena juntarlas ("la otra trae el GPS")
// y para saber qué copiar al unirlas.
const CAMPOS_A_JUNTAR = ['address', 'city', 'zip', 'phone', 'mobile', 'email', 'cif', 'coordinates', 'contactPerson', 'legalName'];

const vacio = (valor) => String(valor ?? '').trim() === '';

// Dos listas de receptores son la misma si tienen a las mismas personas, con el
// mismo documento y en el mismo orden. Ni la fecha ni cómo se tecleó el nombre
// cuentan como novedad.
const comoTexto = (receptores) => receptores
    .map((r) => `${normalizarNombreReceptor(r.name)}|${r.dni}`)
    .join('\n');

export function loQueAportanLasGemelas(principal, gemelas = []) {
    const aportado = {};
    if (!principal) return aportado;

    // Quién ha recibido allí no es un hueco que se rellene, es una lista que se
    // suma. Las gemelas se borran a continuación, y con ellas se irían los
    // nombres y DNI que el repartidor apuntó entregando en esa dirección: el
    // conductor volvería a pedirle el documento a la misma persona. La principal
    // manda en el orden y en el DNI, como en todo lo demás de aquí.
    const deLaPrincipal = leerReceptores(principal);
    let receptores = deLaPrincipal;

    for (const gemela of gemelas) {
        if (!gemela) continue;
        for (const campo of CAMPOS_A_JUNTAR) {
            // Sólo huecos: nunca se pisa un dato de la principal, que es la que
            // el administrativo está mirando y la que decide quedarse.
            if (vacio(principal[campo]) && vacio(aportado[campo]) && !vacio(gemela[campo])) {
                aportado[campo] = String(gemela[campo]).trim();
            }
        }
        receptores = juntarReceptores(receptores, leerReceptores(gemela));
    }

    // Se apunta sólo si las gemelas traen a alguien que la principal no tenía, o
    // el documento de alguien que ella tenía sin él: este objeto decide si hay
    // que guardar y además es lo que se le promete en pantalla al administrativo.
    if (comoTexto(receptores) !== comoTexto(deLaPrincipal)) {
        aportado.receivers = receptores;
        // Ya está dentro de la lista (ver receptoresHabituales.js).
        aportado.lastReceiver = null;
    }

    return aportado;
}

// Nombre corto de cada campo, para el aviso de la tarjeta.
const NOMBRE_DEL_CAMPO = {
    address: 'la dirección',
    city: 'la población',
    zip: 'el código postal',
    phone: 'el teléfono',
    mobile: 'el móvil',
    email: 'el correo',
    cif: 'el CIF',
    coordinates: 'las coordenadas',
    contactPerson: 'la persona de contacto',
    legalName: 'la razón social',
    receivers: 'quién recibe allí',
};

export function explicarAportacion(aportado = {}) {
    // `lastReceiver` no se nombra: no es nada que aporte la gemela, es la forma
    // antigua de guardar lo mismo, que se limpia al escribir la lista.
    const partes = Object.keys(aportado)
        .filter(c => c !== 'lastReceiver')
        .map(c => NOMBRE_DEL_CAMPO[c] || c);
    if (partes.length === 0) return '';
    if (partes.length === 1) return partes[0];
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
