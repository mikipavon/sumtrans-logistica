/**
 * Script: import_fleet_vehicles.cjs
 * Lee los PDFs de documentacion de vehiculos, los convierte a base64
 * y crea/actualiza los vehiculos en Supabase con sus documentos adjuntos.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const DOCS_FOLDER = 'C:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\01 Corporativos\\DOCUMENTACION DE VEHICULOS';

// Vehicles from Excel + extras found in folder
const VEHICLES = [
    { id: '5931LWK',  marca: 'PEUGEOT', modelo: 'Boxer Furgón' },
    { id: '9688LLV',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5834LPF',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5835LPF',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5493KKX',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5958LWK',  marca: 'PEUGEOT', modelo: 'Boxer Furgón' },
    { id: '9221KTX',  marca: 'HYUNDAI', modelo: 'H350' },
    { id: '0343MMY',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0994NKY',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0159NDM',  marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0163NDM',  marca: 'FIAT',    modelo: 'Ducato' },
];

// Map each file to its vehicle and doc type
function classifyFile(filename) {
    const upper = filename.toUpperCase();

    // Extract matricula from filename
    for (const v of VEHICLES) {
        // Match matricula with or without spaces (e.g. "5834 LPF" or "5834LPF")
        const matNoSpace = v.id.replace(/\s/g, '');
        const matSpaced  = matNoSpace.replace(/^(\d+)([A-Z]+)$/, '$1 $2'); // "5834 LPF"
        const matSpaced2 = matNoSpace.replace(/^([A-Z]+)(\d+)([A-Z]+)$/, '$1$2 $3'); // "0343 MMY"

        const patterns = [matNoSpace, matSpaced, matSpaced2].map(p => p.toUpperCase());
        const found = patterns.some(p => upper.includes(p));
        if (!found) continue;

        // Determine doc type
        if (upper.includes('FICHA TECNICA') || upper.includes('FICHA TÉCNICA')) {
            return { vehicleId: v.id, docType: 'Ficha Técnica' };
        }
        if (upper.includes('PERMISO') && upper.includes('CIRCULACION')) {
            return { vehicleId: v.id, docType: 'Permiso de Circulación' };
        }
        // generic match
        return { vehicleId: v.id, docType: 'Otro' };
    }
    return null;
}

function fileToBase64(filePath) {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
}

async function main() {
    console.log('📂 Leyendo carpeta de documentación...\n');

    const files = fs.readdirSync(DOCS_FOLDER).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    });

    // Group docs by vehicle
    const docsByVehicle = {};
    for (const v of VEHICLES) docsByVehicle[v.id] = [];

    for (const file of files) {
        const result = classifyFile(file);
        if (!result) {
            console.log(`  ⚠️  Sin clasificar: ${file}`);
            continue;
        }
        const filePath = path.join(DOCS_FOLDER, file);
        const stats    = fs.statSync(filePath);
        const sizeKB   = (stats.size / 1024).toFixed(1);

        console.log(`  ✅ ${result.vehicleId} — ${result.docType}: ${file} (${sizeKB} KB)`);

        docsByVehicle[result.vehicleId].push({
            id:       Date.now() + Math.random(),
            name:     file.replace(/\.pdf$/i, '').trim(),
            docType:  result.docType,
            type:     'application/pdf',
            size:     sizeKB + ' KB',
            date:     new Date().toLocaleDateString('es-ES'),
            dataUrl:  fileToBase64(filePath),
        });

        // Small delay to avoid id collisions
        await new Promise(r => setTimeout(r, 5));
    }

    console.log('\n🚛 Procesando vehículos...\n');

    // Load existing vehicles from Supabase
    const { data: existing, error: loadErr } = await supabase.from('vehicles').select('id, data');
    if (loadErr) { console.error('Error cargando vehículos:', loadErr); process.exit(1); }

    const existingMap = {};
    (existing || []).forEach(v => { existingMap[v.data?.id || v.id] = v; });

    let created = 0, updated = 0, skipped = 0;

    for (const v of VEHICLES) {
        const docs = docsByVehicle[v.id] || [];
        if (docs.length === 0) {
            console.log(`  ⚠️  ${v.id} — sin documentos encontrados, saltando`);
            skipped++;
            continue;
        }

        const vehicleData = {
            id:               v.id,
            model:            `${v.marca} ${v.modelo}`,
            status:           'Disponible',
            location:         'Base',
            fuel:             '—',
            maintenance:      'OK',
            documents:        docs,
            maintenanceLogs:  [],
            currentOdometer:  '',
            assignedDriverId: null,
        };

        // Check if already exists (match by id field in data column)
        const existingRow = existing?.find(e => e.data?.id === v.id);

        if (existingRow) {
            // Merge documents (keep existing + add new ones not already there)
            const existingDocs = existingRow.data?.documents || [];
            const newDocTypes  = docs.map(d => d.docType);
            const keptDocs     = existingDocs.filter(d => !newDocTypes.includes(d.docType));
            vehicleData.documents        = [...keptDocs, ...docs];
            vehicleData.maintenanceLogs  = existingRow.data?.maintenanceLogs || [];
            vehicleData.currentOdometer  = existingRow.data?.currentOdometer || '';
            vehicleData.assignedDriverId = existingRow.data?.assignedDriverId || null;

            const { error } = await supabase
                .from('vehicles')
                .update({ data: vehicleData })
                .eq('id', v.id);

            if (error) { console.error(`  ❌ Error actualizando ${v.id}:`, error.message); }
            else { console.log(`  🔄 ${v.id} — ACTUALIZADO (${docs.length} docs añadidos)`); updated++; }
        } else {
            // Insert: id column = matricula, data column = full vehicle object
            const { error } = await supabase
                .from('vehicles')
                .insert([{ id: v.id, data: vehicleData }]);

            if (error) { console.error(`  ❌ Error creando ${v.id}:`, error.message); }
            else { console.log(`  ✅ ${v.id} — CREADO con ${docs.length} documentos`); created++; }
        }
    }

    console.log(`
╔══════════════════════════════════════╗
║   ✅ Importación completada          ║
╠══════════════════════════════════════╣
║  Vehículos creados:    ${String(created).padEnd(14)}║
║  Vehículos actualizados: ${String(updated).padEnd(12)}║
║  Sin documentos:       ${String(skipped).padEnd(14)}║
╚══════════════════════════════════════╝
`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
