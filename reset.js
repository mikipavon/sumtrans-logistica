import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local manually to avoid installing dotenv
const envText = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function reset() {
    console.log("Reseteando TR-105 y TR-5 para que puedas volver a probar...");
    const { error } = await supabase
        .from('shipments')
        .update({ codReceiptPhoto: null })
        .in('id', ['TR-105', 'TR-5']);
    
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("✅ ¡Reseteados con éxito! Ahora deberían salir como PENDIENTES.");
    }
}

reset();
