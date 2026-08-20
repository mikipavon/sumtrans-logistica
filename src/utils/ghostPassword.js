/**
 * Contraseña del Modo Fantasma (el atajo de 4 pulsaciones sobre "SUM").
 *
 * La contraseña NUNCA se guarda. Se guarda una huella derivada con PBKDF2 y una
 * sal aleatoria distinta en cada cambio, así que quien lea la fila de `settings`
 * no puede dar marcha atrás y recuperarla. Ese era justo el fallo de la antigua
 * `admin_pass`: estaba en claro y se la descargaba el móvil de cada repartidor
 * (ver supabase/09_cerrar_credenciales_settings.sql).
 *
 * El formato guardado es `pbkdf2$<iteraciones>$<sal>$<huella>`, con la sal y la
 * huella en base64. Lleva las iteraciones dentro para poder subirlas en el
 * futuro sin invalidar las contraseñas ya creadas.
 */

const ITERACIONES = 210000;
const BITS = 256;
const LONGITUD_MINIMA = 6;

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function derivar(password, sal, iteraciones) {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    clave,
    BITS
  );
  return new Uint8Array(bits);
}

/** Compara sin cortocircuito, para no filtrar por tiempo cuántos bytes acertó. */
function sonIguales(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

/** Devuelve la cadena lista para guardar en `settings.value`. */
export async function hashGhostPassword(password) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const huella = await derivar(password, sal, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${aBase64(sal)}$${aBase64(huella)}`;
}

/** true solo si la contraseña corresponde a la huella guardada. */
export async function verifyGhostPassword(password, guardado) {
  if (!password || typeof guardado !== 'string') return false;

  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;

  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones <= 0) return false;

  let sal;
  let esperado;
  try {
    sal = deBase64(partes[2]);
    esperado = deBase64(partes[3]);
  } catch {
    return false;
  }
  if (sal.length === 0 || esperado.length === 0) return false;

  return sonIguales(await derivar(password, sal, iteraciones), esperado);
}

/** Mensaje de error para una contraseña nueva, o null si es válida. */
export function validarNuevaGhostPassword(nueva, repetida) {
  if (!nueva || nueva.length < LONGITUD_MINIMA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (nueva !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}

export const LONGITUD_MINIMA_GHOST = LONGITUD_MINIMA;
