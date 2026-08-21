// ── Con qué correo entra un cliente en el portal ──
//
// Hasta ahora `email` hacía dos papeles a la vez: el correo de la ficha
// (facturación, avisos) y la identidad de la cuenta en Supabase Auth. El
// cliente que quiere las facturas en administración@ y entrar en la app con
// pedidos@ no tenía dónde ponerlo: el que escribieras en la ficha era el
// usuario del portal Y el destinatario de todo lo demás.
//
// `accessEmail` es esa segunda dirección. Si la ficha no la trae se sigue
// usando `email`, así que las fichas de siempre entran igual que siempre y no
// hay que migrar ninguna.
//
// TODO lo que toque Auth de un cliente tiene que pasar por aquí: crear la
// cuenta, cambiar la contraseña, mandarle el aviso de acceso y traducir el
// usuario a email al iniciar sesión. Si un solo sitio se queda leyendo `email`
// a pelo, ese cliente entra por el login antiguo, se queda sin sesión de Auth
// y RLS le deja el portal a cero.
export function emailDeAcceso(client) {
    if (!client) return '';
    const acceso = String(client.accessEmail || '').trim();
    // Minúsculas siempre: Supabase Auth guarda los emails normalizados y la
    // búsqueda de la cuenta existente compara en crudo. Con una mayúscula de
    // más no encuentra la cuenta que ya hay y acabaría creando una segunda.
    if (acceso) return acceso.toLowerCase();
    return String(client.email || '').trim().toLowerCase();
}

// ── ¿Esta ficha entra en el portal? ──
//
// Antes esto se preguntaba con `Boolean(client.password)`: si la ficha guardaba
// una contraseña, es que alguien le había dado acceso. Esa señal desapareció al
// dejar de guardar contraseñas en claro (supabase/16_contrasenas_con_huella.sql),
// así que ahora se escribe aparte, en `tieneAccesoPortal`: lo pone la propia
// migración en todas las fichas que ya tenían contraseña, y lo pone la
// aplicación cada vez que le crea la cuenta de Auth a un cliente.
//
// Importa en dos sitios donde equivocarse tiene coste: avisar de que cambiar el
// correo de acceso deja la cuenta atrás, y marcar en las fichas duplicadas cuál
// de ellas YA entra en el portal antes de aprobar un alta.
export function tieneAccesoAlPortal(client) {
    return Boolean(client?.tieneAccesoPortal);
}

// ¿La ficha lleva un correo de acceso propio, distinto del de la ficha?
// Sirve para avisar en pantalla de que el usuario del portal ya no es el email
// que se ve en la pestaña de contacto.
export function tieneCorreoDeAccesoPropio(client) {
    const acceso = String(client?.accessEmail || '').trim().toLowerCase();
    if (!acceso) return false;
    return acceso !== String(client?.email || '').trim().toLowerCase();
}
