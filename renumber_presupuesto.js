/**
 * Re-numera todos los clientes de Presupuesto (P-1, P-2, P-3...) sin huecos.
 * Ordena alfabéticamente por nombre antes de asignar números.
 * Ejecutar: node renumber_presupuesto.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  const { data: allClients, error } = await supabase.from('clients').select('*');
  if (error) { console.error('Error:', error); return; }

  const presupuesto = allClients
    .filter(c => c.data?.billingType === 'Presupuesto')
    .sort((a, b) => String(a.data?.name || '').localeCompare(String(b.data?.name || ''), 'es', { sensitivity: 'base' }));

  console.log(`🔍 ${presupuesto.length} clientes de Presupuesto encontrados. Re-numerando...\n`);

  let updated = 0;
  for (let i = 0; i < presupuesto.length; i++) {
    const c = presupuesto[i];
    const oldNum = c.data.clientNumber || '—';
    const newNum = `P-${i + 1}`;

    if (oldNum === newNum) {
      console.log(`  — ${newNum} — ${c.data.name} (sin cambio)`);
      updated++;
      continue;
    }

    const newData = { ...c.data, clientNumber: newNum };
    const { error: upErr } = await supabase.from('clients').update({ data: newData }).eq('id', c.id);
    if (upErr) {
      console.error(`  ❌ ${c.data.name}: ${upErr.message}`);
    } else {
      updated++;
      console.log(`  ✅ ${oldNum} → ${newNum} — ${c.data.name}`);
    }
  }

  console.log(`\n🎉 ${updated}/${presupuesto.length} clientes re-numerados correctamente (P-1 a P-${presupuesto.length}).`);
}

main();
