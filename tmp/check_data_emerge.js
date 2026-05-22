import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("---- RESULTADO DE EMERGENCIA EN SUPABASE ----");
    
    const { count: artCount } = await supabase.from('articles').select('*', { count: 'exact', head: true });
    console.log('📦 ARTÍCULOS EN LA NUBE:', artCount);

    const { count: drvCount } = await supabase.from('drivers').select('*', { count: 'exact', head: true });
    console.log('🚚 CONDUCTORES EN LA NUBE:', drvCount);

    const { count: shpCount } = await supabase.from('shipments').select('*', { count: 'exact', head: true });
    console.log('🛵 ENVÍOS EN LA NUBE:', shpCount);
}
check();
