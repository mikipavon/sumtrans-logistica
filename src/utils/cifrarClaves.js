/**
 * Cifrado de la libreta de contraseñas de la oficina (pestaña Notas).
 *
 * Las contraseñas se cifran EN EL NAVEGADOR antes de mandarlas a Supabase, con
 * una llave que sale de la "llave maestra" que teclea la oficina (PBKDF2 +
 * AES-GCM). La llave maestra no se guarda en ningún sitio: sólo vive en memoria
 * mientras la libreta está abierta. Si se olvida, no hay forma de recuperar lo
 * cifrado.
 *
 * Formatos (ver supabase/36_notas_de_la_oficina.sql):
 *   comprobante: `v1.<iteraciones>.<sal>.<iv>.<cifrado>`  (frase fija cifrada)
 *   contraseña:  `v1.<iv>.<cifrado>`
 * Todo en base64. El "v1" permite cambiar de método sin romper lo guardado.
 */

const ITERACIONES = 310000;
const FRASE_COMPROBANTE = 'SUMTRANS-LIBRETA-OK';
const LONGITUD_MINIMA = 8;

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function derivarLlave(llaveMaestra, sal, iteraciones) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(llaveMaestra),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function cifrarCon(llave, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    llave,
    new TextEncoder().encode(texto)
  );
  return `${aBase64(iv)}.${aBase64(cifrado)}`;
}

async function descifrarCon(llave, ivB64, cifradoB64) {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(ivB64) },
    llave,
    deBase64(cifradoB64)
  );
  return new TextDecoder().decode(claro);
}

/**
 * Primera vez: crea el comprobante que se guarda en Supabase y devuelve la
 * llave ya lista para usar.
 */
export async function crearComprobante(llaveMaestra) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const llave = await derivarLlave(llaveMaestra, sal, ITERACIONES);
  const frase = await cifrarCon(llave, FRASE_COMPROBANTE);
  return { comprobante: `v1.${ITERACIONES}.${aBase64(sal)}.${frase}`, llave };
}

/** Devuelve la llave si la llave maestra es la buena, o null si no. */
export async function abrirConComprobante(llaveMaestra, comprobante) {
  if (!llaveMaestra || typeof comprobante !== 'string') return null;
  const partes = comprobante.split('.');
  if (partes.length !== 5 || partes[0] !== 'v1') return null;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones <= 0) return null;
  try {
    const llave = await derivarLlave(llaveMaestra, deBase64(partes[2]), iteraciones);
    const frase = await descifrarCon(llave, partes[3], partes[4]);
    return frase === FRASE_COMPROBANTE ? llave : null;
  } catch {
    // AES-GCM falla al descifrar con una llave equivocada: es "no es la buena".
    return null;
  }
}

export async function cifrarClave(llave, clave) {
  return `v1.${await cifrarCon(llave, clave ?? '')}`;
}

/** Lanza si lo guardado no se puede descifrar con esta llave. */
export async function descifrarClave(llave, guardado) {
  const partes = String(guardado || '').split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') throw new Error('Formato de contraseña desconocido');
  return descifrarCon(llave, partes[1], partes[2]);
}

/** Mensaje de error para una llave maestra nueva, o null si vale. */
export function validarNuevaLlaveMaestra(nueva, repetida) {
  if (!nueva || nueva.length < LONGITUD_MINIMA) {
    return `La llave maestra debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (nueva !== repetida) return 'Las dos llaves no coinciden.';
  return null;
}
