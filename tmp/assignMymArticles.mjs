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
    const familyQuery = 'MYM';
    const clientQuery = 'OLEOHIDRAULICA';
    const clientQuery2 = 'OLEOHIDRÁULICA';

    // 1. Fetch articles and find Family
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const articles = Object.fromEntries(articlesRows.map(a => [a.id, a.data]));
    
    const targetIds = articlesRows
        .filter(a => String(a.data?.category || '').toUpperCase().includes(familyQuery))
        .map(a => a.id);
        
    console.log('Found', targetIds.length, 'articles in the', familyQuery, 'family.');

    // Sort logic from before
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

    const targetClients = clients.filter(c => {
        // Find matching name or any normalization
        const name = String(c.data?.name || '').toUpperCase();
        return name.includes(clientQuery) || name.includes(clientQuery2) || name.replace(/Á/g, 'A') === clientQuery;
    });
    
    console.log('Found', targetClients.length, 'target clients to update.');

    // 3. Update clients
    let updated = 0;
    for (const c of targetClients) {
        let allowedArticles = c.data.allowedArticles || [];
        
        let changed = false;
        for (const nid of targetIds) {
            if (!allowedArticles.includes(nid)) {
                allowedArticles.push(nid);
                changed = true;
            }
        }
        
        if (changed) {
            allowedArticles.sort(sortIds);
            await supabase.from('clients').update({ data: { ...c.data, allowedArticles } }).eq('id', c.id);
            console.log('Updated client:', c.data.name);
            updated++;
        } else {
             console.log('Client', c.data.name, 'already had all', familyQuery, 'articles.');
        }
    }
    
    console.log('Finished updating', updated, 'clients.');
}

run();
