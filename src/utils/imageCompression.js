/**
 * Utilidad para comprimir y redimensionar imágenes en el cliente antes de subirlas a la nube.
 * Reduce drásticamente el peso de las fotos tomadas con el móvil (de ~8MB a ~0.5MB).
 */

/**
 * Redimensiona y comprime una imagen en formato base64.
 * @param {string} base64Str - Imagen original en base64.
 * @param {number} maxWidth - Ancho máximo permitido (default 1280px).
 * @param {number} maxHeight - Alto máximo permitido (default 1280px).
 * @param {number} quality - Calidad de compresión JPEG (0 a 1, default 0.7).
 * @returns {Promise<string>} - Imagen comprimida en base64.
 */
export const compressImage = (base64Str, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calcular nuevas dimensiones manteniendo la proporción
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      
      // IMPORTANTE: Para evitar que las transparencias (como en las firmas) se vuelvan negras
      // al convertir a JPEG, rellenamos el fondo con blanco primero.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Dibujar imagen en el canvas (esto aplica el redimensionado)
      ctx.drawImage(img, 0, 0, width, height);

      // Exportar como JPEG con la calidad deseada (JPEG no soporta transparencia)
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedBase64);
    };
    img.onerror = (error) => reject(error);
  });
};
