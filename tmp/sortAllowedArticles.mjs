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
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const articles = Object.fromEntries(articlesRows.map(a => [a.id, a.data]));
    
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

    const { data: clients, error } = await supabase.from('clients').select('id, data');
    if(error) {
        console.error(error);
        return;
    }
    
    let updated = 0;
    for (const c of clients) {
        if (c.data && c.data.allowedArticles && c.data.allowedArticles.length > 0) {
            const oldOrder = [...c.data.allowedArticles];
            const newOrder = [...c.data.allowedArticles].sort(sortIds);
            
            if (JSON.stringify(oldOrder) !== JSON.stringify(newOrder)) {
                await supabase.from('clients').update({ data: { ...c.data, allowedArticles: newOrder } }).eq('id', c.id);
                updated++;
                console.log('Sorted articles for', c.data.name);
            }
        }
    }
    console.log('Fixed allowedArticles sorting for', updated, 'clients');
}

run();
