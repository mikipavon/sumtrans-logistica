import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function check() {
  const { data: clients, error } = await supabase.from('clients').select('id, data');
  if (error) { console.error('Clients error:', error.message); return; }
  
  const { data: articles, error: artErr } = await supabase.from('articles').select('id, data');
  if (artErr) { console.error('Articles error:', artErr.message); return; }
  
  const articleMap = {};
  (articles || []).forEach(a => {
    articleMap[a.id] = a.data?.name || a.id;
  });

  console.log(`\n=== ARTÍCULOS DISPONIBLES (${(articles||[]).length}) ===`);
  (articles || []).forEach(a => {
    const d = a.data || {};
    console.log(`  ${a.id}: ${d.name || 'SIN NOMBRE'} | precio: ${d.price || 'N/A'} | priceB2: ${d.priceB2 || 'N/A'}`);
  });

  const approved = (clients || []).filter(c => c.data?.status === 'approved' || !c.data?.status);
  const pending = (clients || []).filter(c => c.data?.status === 'pending');

  console.log(`\nTotal clientes: ${(clients||[]).length} (${approved.length} aprobados, ${pending.length} pendientes)`);
  
  console.log(`\n--- APROBADOS CON ARTÍCULOS ---`);
  approved.filter(c => c.data?.allowedArticles?.length > 0).forEach(c => {
    const d = c.data;
    const artNames = d.allowedArticles.map(id => articleMap[id] || articleMap[String(id)] || `?${id}`).join(', ');
    console.log(`  ✅ ${d.name} [${d.billingType}] → ${artNames}`);
  });
  
  console.log(`\n--- APROBADOS SIN ARTÍCULOS ---`);
  approved.filter(c => !c.data?.allowedArticles || c.data.allowedArticles.length === 0).forEach(c => {
    const d = c.data;
    console.log(`  ⚠️  ${d.name} [${d.billingType || 'N/A'}]`);
  });
}

check().catch(console.error);
