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
    // 1. Fetch articles and find 'NEU'
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const articles = Object.fromEntries(articlesRows.map(a => [a.id, a.data]));
    
    const neuIds = articlesRows
        .filter(a => String(a.data?.category || '').toUpperCase().includes('NEU'))
        .map(a => a.id);
        
    console.log('Found', neuIds.length, 'articles in the NEU family.');

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
    const { data: clients } = await supabase.from('clients').select('id, data');
    
    const targetClients = clients.filter(c => {
        const name = String(c.data?.name || '').toUpperCase();
        return name.includes('NEUMATICOS LUCENA') || name.includes('NEUMATICOS VELASCO') || name.includes('NEUMÁTICOS LUCENA') || name.includes('NEUMÁTICOS VELASCO');
    });
    
    console.log('Found', targetClients.length, 'target clients to update.');

    // 3. Update clients
    let updated = 0;
    for (const c of targetClients) {
        let allowedArticles = c.data.allowedArticles || [];
        
        let changed = false;
        for (const nid of neuIds) {
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
             console.log('Client', c.data.name, 'already had all NEU articles.');
        }
    }
    
    console.log('Finished updating', updated, 'clients.');
}

run();
