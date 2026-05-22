import { createClient } from '@supabase/supabase-js';
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
    const { data: articles, error } = await supabase.from('articles').select('id, data');
    if (error) { console.error(error); return; }
    
    // Find articles in 'BADI' family ending in '_B2'
    const badiB2 = articles.filter(a => {
        const cat = String(a.data.category || '').toUpperCase();
        const name = String(a.data.name || '').toUpperCase();
        return cat.includes('BADI') && name.endsWith('_B2');
    });
    
    console.log('Found', badiB2.length, 'articles matching BADI and _B2:');
    badiB2.forEach(a => console.log(' -', a.data.name, '(ID:', a.id, ')'));

    // Deleting
    let deletedCount = 0;
    for (const a of badiB2) {
        const { error: delError } = await supabase.from('articles').delete().eq('id', a.id);
        if (delError) {
            console.error('Failed to delete', a.data.name, delError);
        } else {
            console.log('Deleted', a.data.name);
            deletedCount++;
        }
    }
    
    console.log('Successfully deleted', deletedCount, 'articles.');
}

run();
