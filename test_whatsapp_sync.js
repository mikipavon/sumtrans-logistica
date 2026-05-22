import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSync() {
    console.log("=== PRUEBA DE SINCRONIZACIÓN DE WHATSAPP (BACKGROUND) ===");
    
    // Obtener un cliente real de la base de datos
    const { data: clientsData } = await supabase.from('clients').select('*').limit(1);
    const client = clientsData[0];
    console.log(`✅ Cliente real cargado: ${client.data.name} (Teléfono original: ${client.data.phone || 'Ninguno'})`);

    // Obtener un envío real de la base de datos
    const { data: shipmentsData } = await supabase.from('shipments').select('*').limit(1);
    const shipment = shipmentsData[0];
    console.log(`✅ Albarán real cargado: ${shipment.id} (Teléfono origen original: ${shipment.originPhone || 'Ninguno'})`);

    // --- LOGICA DE ACTUALIZACIÓN ---
    const manualPhone = "TEST_" + Math.floor(Math.random() * 100000);
    console.log(`\n📲 Simulando el guardado del número de WhatsApp: ${manualPhone}...`);

    try {
        // A) Actualizar el albarán
        console.log(`   > Actualizando shipment.originPhone a ${manualPhone}...`);
        await supabase.from('shipments').update({ originPhone: manualPhone }).eq('id', shipment.id);
        
        // B) Actualizar el cliente
        console.log(`   > Actualizando client.data.phone a ${manualPhone}...`);
        const updatedData = { ...client.data, phone: manualPhone };
        await supabase.from('clients').update({ data: updatedData }).eq('id', client.id);
        
        console.log("✅ Proceso en background (Update) ejecutado sin errores.");
    } catch (e) {
        console.error("Error durante el proceso background:", e);
    }
    
    // --- VERIFICACIÓN FINAL ---
    console.log("\n🔍 Verificando los resultados en la base de datos...");
    
    const { data: verifyShipment, error: verifyErr } = await supabase.from('shipments').select('*').eq('id', shipment.id).single();
    if (verifyErr) console.error("Error verify:", verifyErr);
    if (verifyShipment && verifyShipment.originPhone === manualPhone) {
        console.log(`   🟢 ÉXITO: El teléfono del albarán se actualizó correctamente en la BD a ${verifyShipment.originPhone}`);
    } else {
        console.error(`   🔴 FALLO: El teléfono del albarán es ${verifyShipment.originPhone}`);
    }
    
    const { data: verifyClient } = await supabase.from('clients').select('data').eq('id', client.id).single();
    if (verifyClient.data.phone === manualPhone) {
        console.log(`   🟢 ÉXITO: El teléfono de la ficha del cliente se actualizó correctamente a ${verifyClient.data.phone}`);
    } else {
        console.error(`   🔴 FALLO: El teléfono del cliente es ${verifyClient.data.phone}`);
    }
    
    // Restaurar originales
    console.log("\n🧹 Restaurando datos originales...");
    await supabase.from('shipments').update({ originPhone: shipment.originPhone }).eq('id', shipment.id);
    await supabase.from('clients').update({ data: client.data }).eq('id', client.id);
    console.log("🏁 Prueba finalizada.");
}

testSync();
