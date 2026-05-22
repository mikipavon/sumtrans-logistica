import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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
    // 1. Fetch articles and find BLT_1, BLT_2, BLT_3, BLT_4
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const articles = Object.fromEntries(articlesRows.map(a => [a.id, a.data]));
    
    const targetNames = ['BLT_1', 'BLT_2', 'BLT_3', 'BLT_4'];
    const targetIds = articlesRows
        .filter(a => targetNames.includes(String(a.data?.name || '').trim()))
        .map(a => a.id);
        
    console.log('Found', targetIds.length, 'basic BLT articles.');

    // Sort logic
    const sortIds = (idA, idB) => {
        const a = articles[idA];
        const b = articles[idB];
        if (!a || !b) return 0;
        
        const catA = String(a.category || 'zzzz').toLowerCase();
        const catB = String(b.category || 'zzzz').toLowerCase();
        if (catA !== catB) return catA.localeCompare(catB);
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    };

    // 2. Fetch clients
    const { data: clients, error } = await supabase.from('clients').select('id, data');
    if (error) { console.error(error); return;}

    // Filter "untouched" clients (those with exactly 0 allowed articles)
    const targetClients = clients.filter(c => {
        return !c.data?.allowedArticles || c.data.allowedArticles.length === 0;
    });
    
    console.log('Found', targetClients.length, 'clients with 0 allowed articles.');

    // 3. Update clients
    let updated = 0;
    for (const c of targetClients) {
        let allowedArticles = [];
        
        for (const nid of targetIds) {
            allowedArticles.push(nid);
        }
        
        allowedArticles.sort(sortIds);
        await supabase.from('clients').update({ data: { ...c.data, allowedArticles } }).eq('id', c.id);
        updated++;
    }
    
    console.log('Finished updating', updated, 'clients with default BLTs.');
}

run();
