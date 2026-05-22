import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';

// Read .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf8');
const lines = envContent.split('\n');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
        supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    } else if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
        supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('1. Reading Excel...');
    const workbook = XLSX.readFile('crc39_CondicionesEspeciales.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});
    
    const rateMap = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const clientName = (row[0] || '').trim().toLowerCase();
        const articleName = (row[1] || '').trim();
        const price = parseFloat(row[2]);
        if (clientName && articleName && !isNaN(price)) {
            if(!rateMap[clientName]) rateMap[clientName] = {};
            rateMap[clientName][articleName] = price;
        }
    }
    
    console.log('Found custom rates for', Object.keys(rateMap).length, 'unique clients in Excel.');

    console.log('2. Fetching Clients & Articles from Supabase...');
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const articleIdMap = {}; // name -> id
    articlesRows.forEach(a => {
        if(a.data && a.data.name) articleIdMap[a.data.name] = a.id;
    });
    
    console.log('Loaded', articlesRows.length, 'articles to resolve IDs.');
    
    const { data: clients, error } = await supabase.from('clients').select('id, data');
    if (error) {
        console.error('Fetch error:', error);
        return;
    }
    console.log('Loaded', clients.length, 'clients from database.');

    let updatedCount = 0;
    
    for (const client of clients) {
        if(!client.data || !client.data.name) continue;
        
        const normName = client.data.legalName ? client.data.legalName.trim().toLowerCase() : client.data.name.trim().toLowerCase();
        const normName2 = client.data.name.trim().toLowerCase();
        
        const ratesForThisClient = rateMap[normName] || rateMap[normName2];
        
        if (ratesForThisClient) {
            let customRates = client.data.customRates || {};
            let customRatesB2 = client.data.customRatesB2 || {};
            let added = false;
            let allowedArticles = client.data.allowedArticles || [];
            
            for (const [articleNameOriginal, price] of Object.entries(ratesForThisClient)) {
                let isB2 = false;
                let baseArticleName = articleNameOriginal;

                if (baseArticleName.endsWith('_B2')) {
                    isB2 = true;
                    baseArticleName = baseArticleName.replace('_B2', '');
                }

                const aId = articleIdMap[baseArticleName];
                if (aId) {
                    if (isB2) {
                        customRatesB2[aId] = price;
                    } else {
                        customRates[aId] = price;
                    }
                    if(!allowedArticles.includes(aId)) allowedArticles.push(aId);
                    added = true;
                } else {
                    console.log('Warning: Article not found in DB:', articleNameOriginal, '(searched as', baseArticleName, ')');
                }
            }
            
            if (added) {
                const newData = { 
                    ...client.data, 
                    tariffType: 'Personalizada', 
                    customRates,
                    customRatesB2,
                    allowedArticles
                };
                
                const { error: updateError } = await supabase.from('clients')
                    .update({ data: newData })
                    .eq('id', client.id);
                    
                if (updateError) {
                    console.error('Update failed for', client.data.name, updateError);
                } else {
                    console.log('Updated:', client.data.name);
                    updatedCount++;
                }
            }
        }
    }
    
    console.log('Migration complete. Successfully updated', updatedCount, 'clients.');
}

run();
