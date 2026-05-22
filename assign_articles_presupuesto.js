/**
 * Asigna BLT_1-4 a todos los clientes de Presupuesto que no tienen artículos.
 * Ejecutar: node assign_articles_presupuesto.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

const STD_IDS = ['1774442159060', '1774442159061', '1774442159062', '1774442159063']; // BLT_1-4

async function main() {
  const { data: allClients, error } = await supabase.from('clients').select('*');
  if (error) { console.error('Error:', error); return; }

  const presupuesto = (allClients || []).filter(c => 
    c.data?.billingType === 'Presupuesto' && 
    (!c.data?.allowedArticles || c.data.allowedArticles.length === 0)
  );

  console.log(`🔍 ${presupuesto.length} clientes de Presupuesto sin artículos asignados. Asignando BLT_1-4...\n`);

  let updated = 0;
  for (const c of presupuesto) {
    const newData = { ...c.data, allowedArticles: [...STD_IDS] };
    const { error: upErr } = await supabase.from('clients').update({ data: newData }).eq('id', c.id);
    if (upErr) {
      console.error(`  ❌ ${c.data.name}: ${upErr.message}`);
    } else {
      updated++;
      console.log(`  ✅ ${c.data.clientNumber || '—'} — ${c.data.name} → BLT_1, BLT_2, BLT_3, BLT_4`);
    }
  }

  console.log(`\n🎉 ${updated}/${presupuesto.length} clientes actualizados con artículos BLT_1-4.`);
}

main();
