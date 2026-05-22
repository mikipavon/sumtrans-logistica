import { supabase } from '../lib/supabase';

/**
 * Convierte una cadena Base64 en un objeto Blob.
 * @param {string} base64String 
 * @returns {Blob}
 */
const base64ToBlob = (base64String) => {
  const byteString = atob(base64String.split(',')[1]);
  const mimeString = base64String.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

/**
 * Sube una prueba de entrega (firma o foto) a Supabase Storage.
 * @param {string} shipmentId ID del albarán para nombrar el archivo.
 * @param {string} base64Data Datos de la imagen en Base64.
 * @param {string} bucketName Nombre del bucket (signatures o delivery_photos).
 * @returns {Promise<string>} URL pública del archivo subido.
 */
export const uploadProof = async (shipmentId, base64Data, bucketName) => {
  if (!base64Data) return null;

  try {
    const blob = base64ToBlob(base64Data);
    
    // Sanitizar shipmentId: quitar caracteres que den problemas en rutas (/, \, ., espacios)
    const safeId = String(shipmentId || 'unknown').replace(/[^a-z0-9]/gi, '_');
    
    // Detectar extensión real según el tipo de blob
    const extension = blob.type.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `${safeId}_${Date.now()}.${extension}`; 
    const filePath = `${fileName}`;

    console.log(`Intentando subir archivo a bucket ${bucketName} como ${filePath}...`);

    // 1. Intentar subir el archivo
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: blob.type
      });

    if (error) {
       console.error(`ERROR SUPABASE STORAGE (${bucketName}):`, error);
       
       // Proporcionar mensajes más útiles basados en el error de Supabase
       let userFriendlyError = error.message;
       if (error.message.includes('not found')) {
         userFriendlyError = `El contenedor '${bucketName}' no existe.`;
       } else if (error.message.includes('row-level security') || error.statusCode === '403') {
         userFriendlyError = `Permiso denegado (RLS) en '${bucketName}'.`;
       } else if (error.statusCode === '409') {
         userFriendlyError = `Conflicto: El archivo ya existe o duplicado.`;
       }

       throw new Error(userFriendlyError);
    }

    // 2. Obtener la URL pública
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error detallado en uploadProof:', error);
    throw error;
  }
};

/**
 * Sube un archivo genérico (File o Blob) a Supabase Storage.
 * @param {string} fileName Nombre del archivo.
 * @param {File|Blob} file El archivo a subir.
 * @param {string} bucketName Nombre del bucket.
 * @returns {Promise<string>} URL pública del archivo subido.
 */
export const uploadFileToBucket = async (fileName, file, bucketName) => {
  if (!file) return null;

  try {
    const safeName = String(fileName).replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${Date.now()}_${safeName}`;

    console.log(`Intentando subir archivo a bucket ${bucketName} como ${filePath}...`);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/pdf'
      });

    if (error) {
       console.error(`ERROR SUPABASE STORAGE (${bucketName}):`, error);
       let userFriendlyError = error.message;
       if (error.message.includes('not found')) {
         userFriendlyError = `El contenedor '${bucketName}' no existe.`;
       } else if (error.message.includes('row-level security') || error.statusCode === '403') {
         userFriendlyError = `Permiso denegado (RLS) en '${bucketName}'.`;
       } else if (error.statusCode === '409') {
         userFriendlyError = `Conflicto: El archivo ya existe o duplicado.`;
       }
       throw new Error(userFriendlyError);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error detallado en uploadFileToBucket:', error);
    throw error;
  }
};

/**
 * Inicializa los buckets necesarios si no existen.
 */
export const initStorageBuckets = async () => {
  const buckets = ['signatures', 'delivery_photos', 'agency_logos', 'merchandise_photos', 'cod_receipts', 'payrolls'];
  
  for (const bucket of buckets) {
    try {
      const { data, error } = await supabase.storage.getBucket(bucket);
      if (error && error.message.includes('not found')) {
        console.log(`Intentando crear el bucket: ${bucket}...`);
        await supabase.storage.createBucket(bucket, {
          public: true, // Permitir acceso público de lectura por URL
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
          fileSizeLimit: 10485760 // 10MB
        });
      }
    } catch (e) {
      console.warn(`No se pudo verificar/crear el bucket ${bucket}. Es posible que necesites crearlo manualmente en el panel de Supabase.`, e);
    }
  }
};
