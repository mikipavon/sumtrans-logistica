import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: clients } = await supabase.from('clients').select('id, data');
  const { data: rawArticles } = await supabase.from('articles').select('id, data');
  const articles = rawArticles ? rawArticles.map(a => a.data) : [];

  const lucena = clients.find(c => c.data.name.toLowerCase().includes('lucena') && c.data.name.toLowerCase().includes('neum'));
  
  if (!lucena) {
      // Fallback
      const lucena2 = clients.find(c => c.data.name.toLowerCase().includes('lucena'));
      if (lucena2) {
          console.log('Client found via fallback:', lucena2.data.name);
      } else {
          console.log('Client Neumáticos Lucena not found!');
          return;
      }
  } else {
      console.log('Client found:', lucena.data.name);
  }
  
  const targetClient = lucena || clients.find(c => c.data.name.toLowerCase().includes('lucena'));

  // Desired sort order by sales (Top first)
  const topSales = [
    { name: 'RUEDATURISMO', price: '2.50', qty: 25 },
    { name: 'RUEDATRAC.GRANDE', price: '15.00', qty: 24 },
    { name: 'RUEDACAMIÓN', price: '8.00', qty: 17 },
    { name: 'RUEDA4x4', price: '3.00', qty: 16 },
    { name: 'RUEDATRAC.PEQUEÑA', price: '10.00', qty: 12 },
    { name: 'CAJACÁMARAS', price: '5.00', qty: 6 },
    { name: 'INDUSTRIAL', price: '20.00', qty: 3 },
    { name: 'REMOLQUE', price: '4.00', qty: 3 },
    { name: 'BULTO', price: '4.50', qty: 2 },
    { name: 'REEMBOLSO', price: '2.00', qty: 1 },
    { name: 'LLANTAS', price: '5.00', qty: 0 },
    { name: 'MACIZAS', price: '3.00', qty: 0 },
    { name: 'RUEDACARRETILLA', price: '3.00', qty: 0 },
    { name: 'RUEDAFURGÓN', price: '2.00', qty: 0 },
    { name: 'RUEDAMOTO', price: '1.30', qty: 0 }
  ];

  // Match articles in DB
  const allowedArticlesIds = [];
  const customRates = {};
  const customRatesB2 = {};
  
  let updatedArticlesList = [...articles];
  let articlesToUpsert = [];

  console.log('--- Matching Articles for Lucena ---');
  for (const item of topSales) {
      const normalizedQuery = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      let dbArticle = updatedArticlesList.find(a => 
          a.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedQuery && 
          (a.category === 'NEUMATICOS' || a.category === 'NEU' || String(a.category).includes('NEU'))
      );

      if (!dbArticle) {
          dbArticle = updatedArticlesList.find(a => a.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedQuery);
      }
      if (!dbArticle && normalizedQuery.includes('4x4')) {
          dbArticle = updatedArticlesList.find(a => 
              a.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes('4x4') && String(a.category).includes('NEU')
          );
      }

      if (!dbArticle) {
          console.log(`[!] Not found in DB, creating: ${item.name}`);
          dbArticle = {
              id: Date.now() + Math.floor(Math.random() * 10000), // Random ID
              name: item.name,
              category: 'NEUMATICOS',
              price: item.price,
              priceB2: (parseFloat(item.price) + 2).toFixed(2), // heuristic
              unit: 'Unidad'
          };
          updatedArticlesList.push(dbArticle);
          articlesToUpsert.push({ id: dbArticle.id, data: dbArticle });
          await new Promise(r => setTimeout(r, 5));
      } else {
          console.log(`[✓] Found: ${item.name} -> ${dbArticle.name} (ID: ${dbArticle.id})`);
      }

      if (!allowedArticlesIds.includes(dbArticle.id)) {
          allowedArticlesIds.push(dbArticle.id);
      }
      customRates[dbArticle.id] = item.price;
      customRatesB2[dbArticle.id] = (parseFloat(item.price) + 2).toFixed(2);
  }

  if (targetClient) {
      const updatedClientData = {
          ...targetClient.data,
          allowedArticles: allowedArticlesIds,
          customRates: customRates,
          customRatesB2: customRatesB2,
          billingType: 'Facturación Mensual'
      };

      const { error: updateError } = await supabase.from('clients').update({ data: updatedClientData }).eq('id', targetClient.id);
      if (updateError) {
          console.error('Error updating client:', updateError);
      } else {
          console.log(`✅ Client ${targetClient.data.name} updated successfully with sorted list and pricing!`);
      }
  }

  if (articlesToUpsert.length > 0) {
      const { error: articlesError } = await supabase.from('articles').upsert(articlesToUpsert);
      if (articlesError) {
          console.error('Error updating articles DB:', articlesError);
      } else {
          console.log(`✅ Global articles database updated with ${articlesToUpsert.length} new items!`);
      }
  }
}

run();
