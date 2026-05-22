import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log('--- Borrando Clientes Pendientes de Validar ---');

    console.log('1. Cargando todos los clientes...');
    const { data: clients, error: errC } = await supabase.from('clients').select('*');
    
    if (errC) {
        console.error('Error cargando clientes:', errC);
        return;
    }

    const pendingClients = clients.filter(c => c.data && c.data.status === 'pending');
    console.log(`Encontrados ${pendingClients.length} clientes pendientes.`);

    if (pendingClients.length === 0) {
        console.log('No hay clientes pendientes para borrar.');
        return;
    }

    const pendingIds = pendingClients.map(c => c.id);
    console.log('2. Procediendo al borrado...');
    const { error: errD } = await supabase.from('clients').delete().in('id', pendingIds);

    if (errD) {
        console.error('Error borrando clientes:', errD);
    } else {
        console.log(`✅ ¡Éxito! Se han borrado ${pendingIds.length} clientes pendientes.`);
    }

    console.log('--- Operación completada ---');
}

run();
