// ── Una ficha, varios correos ──
//
// El E-mail de la pestaña Contacto es la lista de correos del cliente:
// administración, el comercial que hace los pedidos, el almacén… La oficina los
// escribe seguidos, separados por ';', que es como vienen de Factusol y de los
// propios clientes.
//
// El campo era <input type="email">, y el navegador exige que TODO lo escrito
// sea UNA dirección: en cuanto había un ';' salía "Una parte después de '@' no
// debe incluir el símbolo ' '" y no dejaba guardar la ficha.
//
// Ahora el campo es texto libre, así que quien necesite UNA dirección de
// verdad —la cuenta del portal, un mailto— tiene que sacarla de aquí en vez de
// leer el campo a pelo. Ese es el motivo de este fichero: si alguien vuelve a
// usar `client.email` en crudo para entrar en Supabase Auth, ese cliente se
// queda sin cuenta.
//
// Se separa por ';', por ',' y por espacios, y se descarta lo que no lleve '@'
// (notas sueltas tipo "no tiene correo"). Todo en minúsculas, porque así es
// como Supabase Auth guarda los correos y como se comparan en el resto de la
// aplicación.
const SEPARADORES = /[;,\s]+/;

export function correosDeFicha(valor) {
    return String(valor || '')
        .split(SEPARADORES)
        .map(correo => correo.trim().toLowerCase())
        .filter(correo => correo.includes('@'));
}

// La primera de la lista: la que manda cuando hace falta una sola dirección.
// Vacío si lo escrito no tiene ningún correo reconocible.
export function primerCorreoDeFicha(valor) {
    return correosDeFicha(valor)[0] || '';
}
