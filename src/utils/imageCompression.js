/**
 * Utilidad para comprimir y redimensionar imágenes en el cliente antes de subirlas a la nube.
 * Reduce drásticamente el peso de las fotos tomadas con el móvil (de ~8MB a ~0.5MB).
 *
 * OJO CON LA MEMORIA (esto cerraba la app en Android):
 * una foto de 48 MP descomprimida son ~200 MB de RAM. Si se descomprime entera antes
 * de encogerla, Android mata la pestaña y el repartidor ve que "la app se ha cerrado".
 * Por eso las fotos grandes se descomprimen YA ENCOGIDAS con createImageBitmap.
 */

// Por debajo de este tamaño la foto cabe en memoria sin riesgo, así que se
// descomprime tal cual y respetamos su tamaño original (no la agrandamos).
const TAMANO_SEGURO_BYTES = 1.5 * 1024 * 1024;

/** Convierte un data URL (base64) en Blob sin pasar por la red. */
const dataUrlABlob = (dataUrl) => {
  const [cabecera, datos] = String(dataUrl).split(',');
  const tipo = (cabecera.match(/:(.*?);/) || [null, 'image/jpeg'])[1];
  if (!/;base64/i.test(cabecera)) {
    return new Blob([decodeURIComponent(datos)], { type: tipo });
  }
  const binario = atob(datos);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
};

/** ¿Es una imagen que sabemos encoger? (los PDF y los SVG no pasan por aquí) */
export const esImagenComprimible = (file) =>
  !!file && typeof file.type === 'string' &&
  file.type.startsWith('image/') && file.type !== 'image/svg+xml';

/** Calcula el tamaño final manteniendo la proporción. Nunca agranda. */
const encajar = (ancho, alto, maxAncho, maxAlto) => {
  if (ancho <= maxAncho && alto <= maxAlto) return { ancho, alto };
  const escala = Math.min(maxAncho / ancho, maxAlto / alto);
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala))
  };
};

/**
 * Descomprime la imagen dejándola ya pequeña cuando el fichero es grande.
 * Devuelve algo dibujable en un canvas y una función para liberarlo.
 */
const descomprimir = async (blob, maxAncho) => {
  if (typeof createImageBitmap === 'function') {
    // resizeWidth solo (sin resizeHeight) mantiene la proporción, y el navegador
    // encoge DURANTE la descompresión: la foto entera nunca llega a memoria.
    const opciones = blob.size > TAMANO_SEGURO_BYTES
      ? { resizeWidth: maxAncho, resizeQuality: 'high' }
      : undefined;
    try {
      const bitmap = opciones
        ? await createImageBitmap(blob, opciones)
        : await createImageBitmap(blob);
      return { fuente: bitmap, liberar: () => bitmap.close?.() };
    } catch {
      // Algunos WebView antiguos no admiten las opciones de redimensionado.
    }
  }

  // Respaldo para navegadores sin createImageBitmap.
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return {
      fuente: img,
      liberar: () => { img.src = ''; URL.revokeObjectURL(url); }
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

/**
 * Redimensiona y comprime una imagen.
 * @param {File|Blob|string} origen - Fichero de la cámara, Blob, o imagen en base64.
 * @param {number} maxWidth - Ancho máximo permitido (default 1200px).
 * @param {number} maxHeight - Alto máximo permitido (default 1200px).
 * @param {number} quality - Calidad de compresión JPEG (0 a 1, default 0.7).
 * @param {string} tipoSalida - 'image/jpeg' (default) o 'image/png' para conservar
 *        la transparencia (logos). PNG no aplica el fondo blanco ni la calidad.
 * @returns {Promise<string>} - Imagen comprimida en base64.
 */
export const compressImage = async (origen, maxWidth = 1200, maxHeight = 1200, quality = 0.7, tipoSalida = 'image/jpeg') => {
  const blob = typeof origen === 'string' ? dataUrlABlob(origen) : origen;
  if (!blob || typeof blob.size !== 'number') {
    throw new Error('compressImage: origen no válido');
  }

  const { fuente, liberar } = await descomprimir(blob, maxWidth);
  try {
    const anchoOriginal = fuente.width || fuente.naturalWidth;
    const altoOriginal = fuente.height || fuente.naturalHeight;
    const { ancho, alto } = encajar(anchoOriginal, altoOriginal, maxWidth, maxHeight);

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');

    // IMPORTANTE: Para evitar que las transparencias (como en las firmas) se vuelvan negras
    // al convertir a JPEG, rellenamos el fondo con blanco primero.
    // En PNG no: ahí la transparencia se conserva a propósito (logos).
    if (tipoSalida !== 'image/png') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, ancho, alto);
    }
    ctx.drawImage(fuente, 0, 0, ancho, alto);

    const comprimida = tipoSalida === 'image/png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', quality);

    // Soltar el canvas ya, sin esperar al recolector de basura.
    canvas.width = 0;
    canvas.height = 0;
    return comprimida;
  } finally {
    liberar();
  }
};
