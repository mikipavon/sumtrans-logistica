/**
 * Actualiza todos los clientes de Presupuesto a prioridad Urgente y color rojo.
 * Ejecutar: node update_presupuesto_priority.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  const { data: allClients, error } = await supabase.from('clients').select('*');
  if (error) { console.error('Error:', error); return; }

  const presupuesto = allClients.filter(c => c.data?.billingType === 'Presupuesto');
  console.log(`🔍 Encontrados ${presupuesto.length} clientes de Presupuesto. Actualizando...\n`);

  let updated = 0;
  for (const c of presupuesto) {
    const newData = { ...c.data, priority: 'urgent', color: '#ef4444' };
    const { error: upErr } = await supabase.from('clients').update({ data: newData }).eq('id', c.id);
    if (upErr) {
      console.error(`  ❌ ${c.data.name}: ${upErr.message}`);
    } else {
      updated++;
      console.log(`  ✅ ${c.data.clientNumber || '—'} — ${c.data.name} → Urgente 🔴`);
    }
  }

  console.log(`\n🎉 ${updated}/${presupuesto.length} clientes actualizados a Prioridad Urgente + Color Rojo.`);
}

main();
