import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  console.log('1. Reseteando timelog_confirmations...');
  const { error: err1 } = await supabase.from('settings').upsert({ key: 'timelog_confirmations', value: '[]' });
  if (err1) {
    console.error('Error al resetear confirmaciones:', err1);
  } else {
    console.log('✅ Confirmaciones de horas mensuales reseteadas con éxito.');
  }

  console.log('2. Reseteando PINs de firma de todos los conductores...');
  const { data: drivers } = await supabase.from('drivers').select('*');
  if (drivers) {
    for (const d of drivers) {
      const data = d.data || {};
      if (data.signaturePinHash) {
        delete data.signaturePinHash;
        const { error: err2 } = await supabase.from('drivers').update({ data }).eq('id', d.id);
        if (err2) {
          console.error(`Error al resetear PIN de ${data.name}:`, err2);
        } else {
          console.log(`✅ PIN de firma de ${data.name} reseteado.`);
        }
      }
    }
  }
}
main();
