/**
 * Diagnóstico: ¿Qué artículos tienen los clientes de Facturación?
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  const { data: allClients } = await supabase.from('clients').select('*');
  const { data: allArticles } = await supabase.from('articles').select('*');

  const artMap = new Map();
  (allArticles || []).forEach(a => artMap.set(String(a.id), a.data?.name || a.name || '?'));

  const facturacion = (allClients || []).filter(c => c.data?.billingType === 'Facturación');
  const presupuesto = (allClients || []).filter(c => c.data?.billingType === 'Presupuesto');

  console.log(`=== CLIENTES FACTURACIÓN (${facturacion.length}) ===\n`);

  // Agrupar por combinación de allowedArticles
  const groups = new Map();
  facturacion.forEach(c => {
    const arts = c.data?.allowedArticles || [];
    const key = JSON.stringify(arts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c.data?.name);
  });

  for (const [key, names] of groups) {
    const ids = JSON.parse(key);
    if (ids.length === 0) {
      console.log(`  Sin artículos asignados (${names.length} clientes): usan fallback BLT_1-4`);
      console.log(`    Ejemplo: ${names.slice(0, 3).join(', ')}...\n`);
    } else {
      const artNames = ids.map(id => artMap.get(String(id)) || `ID:${id}`);
      console.log(`  ${ids.length} artículos (${names.length} clientes):`);
      artNames.forEach((n, i) => console.log(`    ${i+1}. ${n}`));
      console.log(`    Clientes: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '...' : ''}\n`);
    }
  }

  console.log(`\n=== CLIENTES PRESUPUESTO (${presupuesto.length}) ===\n`);
  const pGroups = new Map();
  presupuesto.forEach(c => {
    const arts = c.data?.allowedArticles || [];
    const key = JSON.stringify(arts);
    if (!pGroups.has(key)) pGroups.set(key, []);
    pGroups.get(key).push(c.data?.name);
  });
  for (const [key, names] of pGroups) {
    const ids = JSON.parse(key);
    if (ids.length === 0) {
      console.log(`  Sin artículos asignados (${names.length} clientes): usan fallback BLT_1-4`);
    } else {
      const artNames = ids.map(id => artMap.get(String(id)) || `ID:${id}`);
      console.log(`  ${ids.length} artículos (${names.length} clientes): ${artNames.join(', ')}`);
    }
  }
}

main();
