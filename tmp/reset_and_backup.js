import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log('--- Iniciando Backup y Reseteo ---');

    console.log('1. Cargando datos para backup...');
    const { data: clients, error: errC } = await supabase.from('clients').select('*');
    const { data: articles, error: errA } = await supabase.from('articles').select('*');
    
    if (errC || errA) {
        console.error('Error cargando datos:', errC || errA);
        return;
    }

    const backup = {
        timestamp: new Date().toISOString(),
        clients: clients.map(c => ({ id: c.id, name: c.name, data: c.data })),
        articles: articles.map(a => ({ id: a.id, data: a.data }))
    };

    fs.writeFileSync('ultimo_backup_antes_de_produccion.json', JSON.stringify(backup, null, 2));
    console.log('✅ Archivo de backup creado: ultimo_backup_antes_de_produccion.json');

    console.log('2. Borrando todos los envíos...');
    const { error: errS } = await supabase.from('shipments').delete().neq('id', 'temp_placeholder');
    if (errS) {
        console.error('Error borrando envíos:', errS);
    } else {
        console.log('✅ Todos los envíos han sido eliminados.');
    }

    console.log('3. Limpiando coordenadas de clientes...');
    let updatedCount = 0;
    for (const client of clients) {
        const newData = { ...client.data, coordinates: '' };
        const { error: errU } = await supabase.from('clients').update({ data: newData }).eq('id', client.id);
        if (errU) {
            console.error(`Error actualizando cliente ${client.name}:`, errU);
        } else {
            updatedCount++;
        }
    }
    console.log(`✅ Coordenadas limpiadas en ${updatedCount} clientes.`);

    console.log('--- Operación completada con éxito ---');
}

run();
