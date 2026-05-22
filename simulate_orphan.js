import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function createOrphanedFile() {
  const fileName = `simulacion_huerfana_${Date.now()}.png`;
  // Minimal valid 1x1 transparent PNG data:
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const buffer = Buffer.from(base64Data, 'base64');

  console.log(`Subiendo archivo huérfano ${fileName} a la nube...`);
  
  const { data, error } = await supabase.storage
    .from('signatures')
    .upload(fileName, buffer, {
      contentType: 'image/png'
    });

  if (error) {
    console.error('Error subiendo archivo:', error);
  } else {
    console.log('✅ Archivo huérfano subido correctamente:', data.path);
    console.log('Ahora puedes ir a la App y probar el botón de Liberar Espacio.');
  }
}

createOrphanedFile();
