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

// ── Varias personas de la misma empresa entrando al portal ──
//
// El dueño y quien hace los albaranes necesitan entrar cada uno con su correo,
// pero mirando la MISMA ficha: los mismos envíos, la misma tarifa, el mismo
// histórico. Eso ya se podía hacer sin tocar la seguridad, porque el portal no
// reconoce al cliente por el correo sino por `profiles.linked_id` (ver
// supabase/04_restrictive_rls_policies.sql). Dos cuentas de Auth apuntando al
// mismo `linked_id` ven exactamente lo mismo.
//
// `accessEmail` sigue siendo el correo PRINCIPAL y no cambia de significado: es
// el que resuelve el login cuando alguien escribe el nombre de la empresa
// ("ACTIVA") en vez de un correo. Los adicionales viven aparte, en
// `accessEmailsExtra`, y entran escribiendo su correo entero — con varias
// cuentas, el nombre de la empresa ya no puede decidir a cuál de ellas mandar.
//
// En la ficha se guarda sólo el correo. La contraseña de cada uno viaja a Auth
// y no se queda aquí, igual que la principal (supabase/16_contrasenas_con_huella.sql).
export function accesosAdicionales(client) {
    const filas = Array.isArray(client?.accessEmailsExtra) ? client.accessEmailsExtra : [];
    // El principal ya cuenta con su propia cuenta: si alguien lo repite abajo no
    // se crea nada, se le trataría como adicional y se pisarían entre ellos.
    const vistos = new Set([emailDeAcceso(client)].filter(Boolean));
    const salida = [];

    for (const fila of filas) {
        const email = String(fila?.email || '').trim().toLowerCase();
        if (!email || vistos.has(email)) continue;
        vistos.add(email);
        salida.push({ email, password: String(fila?.password || '') });
    }

    return salida;
}

// Todos los correos con los que se puede entrar a esta ficha, el principal
// primero. Sirve para enseñarlos juntos y para reconocer una ficha por
// cualquiera de sus correos.
export function correosDeAcceso(client) {
    const principal = emailDeAcceso(client);
    return [principal, ...accesosAdicionales(client).map(a => a.email)].filter(Boolean);
}

// ── Lo que se guarda en la tabla, sin ninguna contraseña ──
//
// La ficha nunca guarda contraseñas, ni la principal ni las de los accesos
// adicionales: van sólo a Supabase Auth. Antes esto era un `const { password,
// ...resto }` suelto en cada guardado; con los accesos adicionales hay
// contraseñas también dentro del array, y un destructuring de primer nivel no
// las ve. Que pase todo por aquí evita que la próxima contraseña anidada acabe
// escrita en claro en la base de datos.
//
// De paso deja el array limpio: sin filas vacías, en minúsculas y sin repetir,
// que es como Auth guarda los correos.
export function fichaSinContrasenas(client) {
    const { password: _fueraDeLaFicha, ...ficha } = client || {};
    if (Array.isArray(ficha.accessEmailsExtra)) {
        ficha.accessEmailsExtra = accesosAdicionales(client).map(({ email }) => ({ email }));
    }
    return ficha;
}
