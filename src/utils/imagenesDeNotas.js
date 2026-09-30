/**
 * Imágenes de la pestaña "Notas y Contraseñas" (supabase/37_imagenes_en_las_notas.sql).
 *
 * Van a un contenedor PRIVADO: en la fila sólo se guarda la ruta y, para verla,
 * se pide un enlace temporal. Las de una contraseña se suben cifradas con la
 * llave maestra y se descifran aquí, en el navegador, para enseñarlas.
 *
 * Cada imagen de la lista `imagenes` es { ruta, tipo, nombre, cifrada }.
 */
import { supabase } from '../lib/supabase';
import { cifrarBytes, descifrarBytes } from './cifrarClaves';

export const BUCKET_NOTAS = 'notas_oficina';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const TAMANO_SIN_TOCAR = 1.5 * 1024 * 1024;
const LADO_MAXIMO = 2000;

const mensajeDeAlmacen = (error) => {
  const texto = error?.message || '';
  if (/not found/i.test(texto)) return 'Falta el almacén de imágenes: hay que ejecutar supabase/37_imagenes_en_las_notas.sql en Supabase.';
  if (/row-level security|unauthorized|403/i.test(texto) || error?.statusCode === '403') return 'Permiso denegado: las imágenes de notas sólo las sube la oficina.';
  return texto || 'No se pudo subir la imagen.';
};

/** Las imágenes que trae un Ctrl+V (vacío si lo pegado es texto). */
export function imagenesDelPortapapeles(evento) {
  return Array.from(evento.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
}

// Una captura de pantalla normal se queda tal cual (la letra pequeña sigue
// legible); sólo se encoge lo que pesa mucho, como una foto del móvil.
async function reducir(fichero) {
  if (TIPOS.includes(fichero.type) && fichero.size <= TAMANO_SIN_TOCAR) return fichero;
  try {
    const bitmap = await createImageBitmap(fichero);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.88));
    return blob || fichero;
  } catch {
    return fichero;
  }
}

/** Sube una imagen; con `llave`, cifrada. Devuelve la entrada para `imagenes`. */
export async function subirImagen(fichero, llave = null) {
  const lista = await reducir(fichero);
  const tipo = TIPOS.includes(lista.type) ? lista.type : 'image/jpeg';
  const extension = tipo.split('/')[1].replace('jpeg', 'jpg');
  const ruta = `${crypto.randomUUID()}.${llave ? 'bin' : extension}`;

  const cuerpo = llave
    ? new Blob([await cifrarBytes(llave, await lista.arrayBuffer())], { type: 'application/octet-stream' })
    : lista;

  const { error } = await supabase.storage.from(BUCKET_NOTAS).upload(ruta, cuerpo, {
    upsert: false,
    contentType: llave ? 'application/octet-stream' : tipo,
  });
  if (error) throw new Error(mensajeDeAlmacen(error));

  return { ruta, tipo, nombre: fichero.name || 'imagen', cifrada: Boolean(llave) };
}

/**
 * Enlace para enseñar la imagen. Las cifradas se bajan, se descifran y se
 * enseñan desde memoria (`liberar` = hay que soltar el enlace al acabar).
 */
export async function enlaceDeImagen(imagen, llave = null) {
  if (imagen.cifrada) {
    if (!llave) throw new Error('Hace falta la llave maestra para ver esta imagen.');
    const { data, error } = await supabase.storage.from(BUCKET_NOTAS).download(imagen.ruta);
    if (error) throw new Error(mensajeDeAlmacen(error));
    const claro = await descifrarBytes(llave, await data.arrayBuffer());
    return { url: URL.createObjectURL(new Blob([claro], { type: imagen.tipo })), liberar: true };
  }
  const { data, error } = await supabase.storage.from(BUCKET_NOTAS).createSignedUrl(imagen.ruta, 3600);
  if (error) throw new Error(mensajeDeAlmacen(error));
  return { url: data.signedUrl, liberar: false };
}

/** Borra del almacén. Si falla sólo queda un fichero huérfano: no se avisa. */
export async function borrarImagenes(imagenes) {
  const rutas = (imagenes || []).map((i) => i.ruta).filter(Boolean);
  if (!rutas.length) return;
  const { error } = await supabase.storage.from(BUCKET_NOTAS).remove(rutas);
  if (error) console.error('No se pudieron borrar imágenes de notas:', error);
}
