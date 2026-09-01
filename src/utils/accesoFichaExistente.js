// ── El cliente de siempre que sólo quería entrar en el portal ──
//
// El formulario de la web es público, así que `registro-cliente` NUNCA toca una
// ficha existente: todo registro entra como una ficha nueva y pendiente, también
// el de la empresa que lleva veinte años en cartera y lo único que quiere es su
// acceso a la app. Hasta ahora el único botón era «Aprobar», y aprobar eso deja
// dos fichas de la misma empresa — y el portal atado a la nueva, la vacía: el
// cliente entra y no ve ninguno de sus envíos.
//
// Aquí se decide lo contrario: quedarse con la ficha que ya existe y ponerle
// SÓLO el acceso. Los datos de la ficha —dirección, tarifa, teléfono, número de
// cliente— son los de la oficina y no los cambia quien rellena un formulario.
//
// Quién decide es el administrativo, mirando el aviso de duplicado. Esto no
// adivina nada: el CIF es información pública y quien se registra puede no ser
// de esa empresa (ver duplicadosClientes.js).

import { emailDeAcceso, accesosAdicionales, tieneAccesoAlPortal } from './clientAccess';

// Qué hay que hacer para que el acceso caiga en la ficha buena.
//
// Devuelve `{ posible: false, motivo }` cuando no hay nada que mover, o
// `{ posible: true, correo, adicional, cambios }`:
//   - `correo`   : con el que entrará al portal, el del registro web.
//   - `adicional`: si es una cuenta MÁS de esa ficha (el dueño y quien hace los
//                  albaranes entran cada uno con el suyo y ven lo mismo) o si es
//                  la cuenta principal de la ficha.
//   - `cambios`  : lo único que se le escribe a la ficha existente.
export function planDeAcceso(solicitud, ficha) {
    if (!solicitud || !ficha) {
        return { posible: false, motivo: 'falta la solicitud o la ficha' };
    }

    const correo = emailDeAcceso(solicitud);
    if (!correo) {
        return { posible: false, motivo: 'la solicitud no trae ningún correo con el que entrar' };
    }

    const principal = emailDeAcceso(ficha);
    const extras = accesosAdicionales(ficha);

    // Ya es el correo principal de la ficha: no hay nada que añadir, sólo dejar
    // constancia de que a partir de ahora entra en el portal. La cuenta de Auth
    // sí hay que moverla, que sigue apuntando a la solicitud.
    if (correo === principal) {
        return { posible: true, correo, adicional: false, cambios: { tieneAccesoPortal: true } };
    }

    // Ya figuraba como acceso adicional (se registró dos veces, o se le apuntó a
    // mano y nunca se le creó la cuenta): tampoco se toca la lista.
    if (extras.some(a => a.email === correo)) {
        return { posible: true, correo, adicional: true, cambios: { tieneAccesoPortal: true } };
    }

    // La ficha no entraba en el portal todavía: este correo pasa a ser el suyo.
    // Se escribe en `accessEmail` y no en `email`, que es el de facturación y
    // avisos y no tiene por qué cambiar porque alguien pida el acceso.
    if (!tieneAccesoAlPortal(ficha)) {
        return {
            posible: true,
            correo,
            adicional: false,
            cambios: { accessEmail: correo, tieneAccesoPortal: true },
        };
    }

    // La ficha ya entra con otro correo: esto es otra persona de la misma
    // empresa. Se le añade su propio acceso en vez de quitarle el suyo al que ya
    // entraba (ver accesosAdicionales en clientAccess.js).
    return {
        posible: true,
        correo,
        adicional: true,
        cambios: {
            accessEmailsExtra: [...extras.map(({ email }) => ({ email })), { email: correo }],
            tieneAccesoPortal: true,
        },
    };
}

// El texto del aviso que se le enseña al administrativo antes de hacerlo. Se
// escribe aquí, junto a la decisión, para que lo que se le promete en pantalla
// sea exactamente lo que se va a escribir.
export function explicarElAcceso(solicitud, ficha, plan) {
    if (!plan?.posible) return '';

    const nombreFicha = `«${ficha?.name || 'la ficha'}»${ficha?.clientNumber ? ` (nº ${ficha.clientNumber})` : ''}`;

    return [
        `El acceso al portal se le da a la ficha que YA tienes:`,
        ``,
        `   • ${nombreFicha}`,
        ``,
        `Entrará con: ${plan.correo}`,
        plan.adicional
            ? `Esa ficha ya tenía acceso, así que éste se le añade: entrarán los dos y verán lo mismo.`
            : `Ése pasa a ser su correo de acceso al portal.`,
        ``,
        `De la ficha no se toca nada más: dirección, tarifa, teléfono y número siguen igual.`,
        `La solicitud de «${solicitud?.name || 'la web'}» se borra, así que no queda una segunda ficha.`,
        ``,
        `Comprueba antes que quien se ha registrado es de verdad de esa empresa: el CIF es público.`,
        ``,
        `¿Darle el acceso?`,
    ].join('\n');
}
