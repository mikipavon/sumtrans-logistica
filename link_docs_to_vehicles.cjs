/**
 * link_docs_to_vehicles.cjs
 * Los PDFs ya están subidos al Storage (de la ejecución anterior).
 * Este script solo construye las URLs públicas y las vincula a cada vehículo.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const BUCKET      = 'vehicle_docs';
const STORAGE_URL = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

// Mapa completo: vehicleId → sus archivos ya subidos al Storage
const VEHICLE_FILES = {
    '5931LWK': [
        { file: 'PEUGEOT- PERMISO CIRCULACION 5931 LWK.pdf', docType: 'Permiso de Circulación' },
        { file: 'PEUGEOT-FICHA TECNICA 5931 LWK.pdf',        docType: 'Ficha Técnica' },
    ],
    '9688LLV': [
        { file: 'FIAT-FICHA TECNICA 9688LLV.pdf',            docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO DE CIRCULACION 9688LLV.pdf',   docType: 'Permiso de Circulación' },
    ],
    '5834LPF': [
        { file: 'FIAT-FICHA TECNICA 5834LPF.pdf',                       docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO DE CIRCULACION 5834 LPF(JAVIER).pdf',     docType: 'Permiso de Circulación' },
    ],
    '5835LPF': [
        { file: 'FIAT-FICHA TECNICA 5835LPF (VICTOR).pdf',              docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO CIRCULACION 5835LPF (VICTOR).pdf',        docType: 'Permiso de Circulación' },
    ],
    '5493KKX': [
        { file: 'FIAT- FICHA TECNICA 5493KKX(RAMBLA).pdf',              docType: 'Ficha Técnica' },
        { file: 'FIAT- PERMISO CIRCULACION 5493 KKX.pdf',               docType: 'Permiso de Circulación' },
    ],
    '5958LWK': [
        { file: 'PEUGEOT-FICHA TECNICA 5958 LWK (2).pdf',               docType: 'Ficha Técnica' },
        { file: 'PEUGEOT-PERMISO CIRCULACION 5958LWK.pdf',              docType: 'Permiso de Circulación' },
    ],
    '9221KTX': [
        { file: 'HYUNDAY- FICHA TECNICA 9221KTX.pdf',                   docType: 'Ficha Técnica' },
        { file: 'HYUNDAY- PERMISO CIRCULACION 9221KTX.pdf',             docType: 'Permiso de Circulación' },
    ],
    '0343MMY': [
        { file: 'FICHA TECNICA 0343MMY.pdf',                            docType: 'Ficha Técnica' },
        { file: 'PERMISO CIRCULACION 0343MMY.pdf',                      docType: 'Permiso de Circulación' },
        { file: 'CONTRATO COMPRAVENTA DE FIAT DUCATO0343MMY.pdf',       docType: 'Contrato' },
    ],
    '0994NKY': [
        { file: 'FIAT - FICHA TECNICA 0994NKY- PACO.pdf',               docType: 'Ficha Técnica' },
        { file: 'FIAT- PERMISO CIRCULACION 0994NKY- PACO.pdf',          docType: 'Permiso de Circulación' },
    ],
    '0159NDM': [
        { file: 'FICHA TECNICA FIAT 0159NDM.pdf',                       docType: 'Ficha Técnica' },
        { file: 'PERMISO DE CIRCULACION FIAT 0159NDM.pdf',              docType: 'Permiso de Circulación' },
    ],
    '0163NDM': [
        { file: 'FICHA TECNICA FIAT 0163NDM.pdf',                       docType: 'Ficha Técnica' },
        { file: 'PERMISO CIRCULACION FIAT 0163NDM.pdf',                 docType: 'Permiso de Circulación' },
    ],
};

const VEHICLE_MODELS = {
    '5931LWK': 'PEUGEOT Boxer Furgón',
    '9688LLV': 'FIAT Ducato',
    '5834LPF': 'FIAT Ducato',
    '5835LPF': 'FIAT Ducato',
    '5493KKX': 'FIAT Ducato',
    '5958LWK': 'PEUGEOT Boxer Furgón',
    '9221KTX': 'HYUNDAI H350',
    '0343MMY': 'FIAT Ducato',
    '0994NKY': 'FIAT Ducato',
    '0159NDM': 'FIAT Ducato',
    '0163NDM': 'FIAT Ducato',
};

async function main() {
    console.log('🔗 Vinculando documentos del Storage a vehículos...\n');

    let ok = 0, failed = 0;

    for (const [vehicleId, files] of Object.entries(VEHICLE_FILES)) {
        console.log(`📋 ${vehicleId} — ${VEHICLE_MODELS[vehicleId]}`);

        // Get existing vehicle data
        const { data: row, error: fetchErr } = await supabase
            .from('vehicles')
            .select('data')
            .eq('id', vehicleId)
            .single();

        if (fetchErr) {
            console.error(`  ❌ No se encontró ${vehicleId}:`, fetchErr.message);
            failed++;
            continue;
        }

        // Build documents array using public URLs (files already in Storage)
        const docs = files.map((f, i) => ({
            id:      Date.now() + i,
            name:    f.file.replace(/\.pdf$/i, '').trim(),
            docType: f.docType,
            type:    'application/pdf',
            size:    '—',
            date:    new Date().toLocaleDateString('es-ES'),
            // URL pública directa del Storage (los archivos se subieron en task-155)
            dataUrl: `${STORAGE_URL}/${vehicleId}/${encodeURIComponent(f.file)}`,
        }));

        docs.forEach(d => console.log(`  🔗 ${d.docType}: ${d.dataUrl.substring(0, 80)}...`));

        // Update vehicle with document links
        const updatedData = { ...(row.data || {}), documents: docs };
        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: updatedData })
            .eq('id', vehicleId);

        if (updateErr) {
            console.error(`  ❌ Error actualizando ${vehicleId}:`, updateErr.message);
            failed++;
        } else {
            console.log(`  ✅ ${vehicleId} — ${docs.length} documentos vinculados\n`);
            ok++;
        }

        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`
╔══════════════════════════════════════╗
║   RESULTADO FINAL                    ║
╠══════════════════════════════════════╣
║  Vehículos actualizados: ${String(ok).padEnd(12)}║
║  Con errores:            ${String(failed).padEnd(12)}║
╚══════════════════════════════════════╝
`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
