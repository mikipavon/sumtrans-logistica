// ── Diálogo con la web que nos embebe en un iframe ──
//
// El portal de clientes vive dentro de un iframe en sumtransportes.com. Hasta
// ahora las credenciales llegaban en la barra de direcciones
// (?autoLogin=true&username=...&password=...), que es el peor sitio posible:
// las URLs quedan en el historial del navegador, en los registros de acceso del
// alojamiento y se filtran a terceros en la cabecera Referer.
//
// Este módulo centraliza el canal alternativo — postMessage — y, de paso, deja
// de mandar los avisos de vuelta con destino '*', que se los entregaba a
// cualquier página que nos tuviera embebidos.
//
// ── Lo que hay que poner en sumtransportes.com (la web padre) ──
// Sustituye al iframe con credenciales en la URL. El src ya no lleva nada
// sensible y las credenciales se mandan cuando el portal avisa de que está listo:
//
//   <iframe id="portal" src="https://sumtrans-logistica.vercel.app/?tab=client"></iframe>
//
//   <script>
//     const PORTAL = 'https://sumtrans-logistica.vercel.app';
//     window.addEventListener('message', (e) => {
//       if (e.origin !== PORTAL) return;
//       if (e.data?.type === 'SUM_CLIENT_LOGIN_READY') {
//         document.getElementById('portal').contentWindow.postMessage({
//           type: 'SUM_CLIENT_CREDENTIALS',
//           username: usuarioDelCliente,   // de la sesión de la web
//           password: contrasenaDelCliente,
//           tab: 'client',
//         }, PORTAL);
//       }
//       if (e.data?.type === 'SUM_CLIENT_LOGIN_SUCCESS') { /* ocultar spinner */ }
//       if (e.data?.type === 'SUM_CLIENT_LOGIN_FAILED') {
//         // OJO: el mensaje lo manda el portal, que es el único que sabe por qué
//         // ha fallado. La web NO debe tener su propio texto fijo: hoy enseña
//         // "Credenciales inválidas" pase lo que pase, y cuando el que falla es
//         // el servidor eso es mentira — manda al cliente a cambiar una
//         // contraseña que está bien. Ver el comentario de intentarAutoLogin.
//         //   e.data.motivo === 'credenciales' → la contraseña o el usuario no valen
//         //   e.data.motivo === 'servidor'     → no ha contestado; que vuelva a probar
//         alert(e.data.mensaje || 'No se ha podido entrar. Inténtalo de nuevo.');
//       }
//     });
//   </script>
//
// Mientras la web padre no se actualice sigue funcionando el canal viejo de la
// URL, pero el portal borra usuario y contraseña de la barra de direcciones
// nada más arrancar (ver src/pages/Login.jsx).

const ORIGENES_POR_DEFECTO = [
  'https://www.sumtransportes.com',
  'https://sumtransportes.com',
];

// Se puede ampliar sin tocar código con VITE_ORIGENES_PADRE="https://a.com,https://b.com"
const ORIGENES_CONFIGURADOS = (import.meta.env.VITE_ORIGENES_PADRE || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

export const ORIGENES_PADRE = [
  ...ORIGENES_POR_DEFECTO,
  ...ORIGENES_CONFIGURADOS,
  // En desarrollo el "padre" suele ser otro localhost
  ...(import.meta.env.DEV ? ['http://localhost:5173', 'https://localhost:5173'] : []),
];

/** ¿Estamos dentro de un iframe? */
export const estamosEmbebidos = () => {
  try {
    return window.parent !== window;
  } catch {
    // Si el acceso lanza, es que hay otro origen de por medio: sí, embebidos
    return true;
  }
};

/** ¿Este origen es una de las webs que tienen permiso para hablarnos? */
export const esOrigenPadrePermitido = (origen) => ORIGENES_PADRE.includes(origen);

/**
 * ¿Esta carga la manda la web padre, con credenciales por delante?
 *
 * Importa para una cosa concreta: cuando es que sí, quien decide qué cliente
 * entra son esas credenciales, NO la sesión que quedara guardada en este
 * navegador. Sin esa distinción pasaba lo del 10/09/2026: la web mandaba las
 * credenciales de un cliente, la sesión guardada era la del cliente anterior, y
 * como nadie esperaba a nadie ganaba la guardada — el portal enseñaba los
 * albaranes de otra empresa mientras la web avisaba de que el acceso había
 * fallado. Ver restoreSession en App.jsx.
 *
 * Estar embebidos basta: este portal no se mete en el iframe de nadie más, y
 * ante la duda lo seguro es no dar por buena una sesión que no ha pedido quien
 * nos abre.
 */
export const hayAutoLoginPendiente = () => {
  if (estamosEmbebidos()) return true;
  try {
    // El canal viejo, mientras siga vivo: las credenciales en la URL.
    return new URLSearchParams(window.location.search).get('autoLogin') === 'true';
  } catch {
    return false;
  }
};

/**
 * Manda un aviso a la web que nos embebe, uno por cada origen permitido.
 * Los navegadores descartan en silencio los que no coinciden con el padre real,
 * así que sólo lo recibe quien debe, sin usar el comodín '*'.
 */
export const avisarAlPadre = (mensaje) => {
  if (!estamosEmbebidos()) return;
  for (const origen of ORIGENES_PADRE) {
    try {
      window.parent.postMessage(mensaje, origen);
    } catch {
      // Un origen mal escrito no debe tumbar los demás avisos
    }
  }
};
