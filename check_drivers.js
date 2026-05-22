import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  const { data: drivers } = await supabase.from('drivers').select('*');
  
  console.log('=== CONDUCTORES ===\n');
  (drivers || []).forEach(d => {
    const data = d.data || {};
    console.log(`📋 ${data.name || d.name || '?'}`);
    console.log(`   Status: ${data.status || '?'}`);
    console.log(`   GPS: lat=${data.currentLat || 'NO'}, lng=${data.currentLng || 'NO'}`);
    console.log(`   Última señal: ${data.lastGpsUpdate || 'NUNCA'}`);
    console.log(`   Vehículo: ${data.vehicle || 'Sin asignar'}`);
    console.log('');
  });
}
main();
