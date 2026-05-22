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

  const velasco = clients.find(c => c.data.name.toLowerCase().includes('velasco'));
  if (!velasco) {
      console.log('Client Velasco not found!');
  } else {
      console.log('Client found:', velasco.data.name);
  }

  // Desired sort order by sales (Top first)
  const topSales = [
    { name: 'RUEDATURISMO', price: '2.00', qty: 264 },
    { name: 'RUEDACAMIÓN', price: '6.00', qty: 39 },
    { name: 'RUEDA4x4', price: '3.00', qty: 38 },
    { name: 'REMOLQUE', price: '5.00', qty: 19 },
    { name: 'RUEDAFURGÓN', price: '2.20', qty: 16 },
    { name: 'RUEDATRAC.PEQUEÑA', price: '10.00', qty: 9 },
    { name: 'INDUSTRIALES', price: '16.00', qty: 5 },
    { name: 'RUEDATRAC.GRANDE', price: '15.00', qty: 4 },
    { name: 'CAJACÁMARAS', price: '4.00', qty: 3 },
    { name: 'BULTO', price: '4.00', qty: 1 },
    { name: 'LLANTAS', price: '3.00', qty: 0 },
    { name: 'PALACHICA', price: '10.00', qty: 0 },
    { name: 'RUEDACARRETILLA', price: '5.00', qty: 0 },
    { name: 'RUEDAMOTO', price: '2.00', qty: 0 },
    { name: 'RUEDAQUAD', price: '5.00', qty: 0 },
    { name: 'CARRETILLA', price: '5.00', qty: 0 },
    { name: 'INDUSTRIAL', price: '20.00', qty: 0 },
    { name: 'PALET(40 RUEDAS)', price: '26.40', qty: 0 },
    { name: 'RUEDAS ADICIONALES AL PALET', price: '0.50', qty: 0 },
    { name: 'REEMBOLSO', price: '0.00', qty: 0 },
    { name: 'MACIZAS', price: '0.00', qty: 0 }
  ];

  // Match articles in DB
  const allowedArticlesIds = [];
  const customRates = {};
  const customRatesB2 = {};
  
  // Try to find the articles in DB, or create them if they do not exist
  let updatedArticlesList = [...articles];
  let articlesToUpsert = [];

  console.log('--- Matching Articles ---');
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

  if (velasco) {
      const updatedClientData = {
          ...velasco.data,
          allowedArticles: allowedArticlesIds,
          customRates: customRates,
          customRatesB2: customRatesB2,
          billingType: 'Facturación Mensual'
      };

      const { error: updateError } = await supabase.from('clients').update({ data: updatedClientData }).eq('id', velasco.id);
      if (updateError) {
          console.error('Error updating client:', updateError);
      } else {
          console.log('✅ Client NEU Velasco updated successfully with sorted list and pricing!');
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
