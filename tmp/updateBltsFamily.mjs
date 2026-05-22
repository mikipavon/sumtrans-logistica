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
    
    let count = 0;
    for (const a of articlesRows) {
        if (a.data.name && a.data.name.startsWith('BLT_')) {
            if (a.data.category !== 'BADI') {
                const newData = { ...a.data, category: 'BADI' };
                await supabase.from('articles').update({ data: newData }).eq('id', a.id);
                console.log('Updated', a.data.name, 'to BADI');
                count++;
            }
        }
    }
    console.log('Total updated:', count);
}

run();
