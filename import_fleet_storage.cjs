/**
 * import_fleet_storage.cjs
 * Crea los vehículos en Supabase y sube los PDFs al Storage (bucket 'vehicle_docs').
 * Guarda solo la URL pública en el documento, no el base64.
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const DOCS_FOLDER = 'C:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\01 Corporativos\\DOCUMENTACION DE VEHICULOS';
const BUCKET = 'vehicle_docs';

const VEHICLES = [
    { id: '5931LWK', marca: 'PEUGEOT', modelo: 'Boxer Furgón' },
    { id: '9688LLV', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5834LPF', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5835LPF', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5493KKX', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '5958LWK', marca: 'PEUGEOT', modelo: 'Boxer Furgón' },
    { id: '9221KTX', marca: 'HYUNDAI', modelo: 'H350' },
    { id: '0343MMY', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0994NKY', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0159NDM', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0163NDM', marca: 'FIAT',    modelo: 'Ducato' },
];

function classifyFile(filename, vehicleId) {
    const upper      = filename.toUpperCase();
    const matNoSpace = vehicleId.replace(/\s/g, '').toUpperCase();
    const matSpaced  = matNoSpace.replace(/^(\d+)([A-Z]+)$/, '$1 $2');
    if (![matNoSpace, matSpaced].some(p => upper.includes(p))) return null;
    if (upper.includes('FICHA TECNICA') || upper.includes('FICHA TÉCNICA')) return 'Ficha Técnica';
    if (upper.includes('PERMISO') && upper.includes('CIRCULACION'))          return 'Permiso de Circulación';
    if (upper.includes('CONTRATO'))                                           return 'Contrato';
    return 'Otro';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureBucket() {
    // Just verify the bucket is accessible by listing its contents
    const { error } = await supabase.storage.from(BUCKET).list('', { limit: 1 });
    if (error) {
        console.error(`❌ No se puede acceder al bucket '${BUCKET}':`, error.message);
        return false;
    }
    console.log(`📦 Bucket '${BUCKET}' listo`);
    return true;
}

async function uploadPDF(vehicleId, filename, filePath) {
    const storagePath = `${vehicleId}/${filename}`;
    const fileBuffer  = fs.readFileSync(filePath);

    // Try upload (upsert to overwrite if already exists)
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true,
        });

    if (error) {
        console.error(`    ❌ Upload error para ${filename}:`, error.message);
        return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return urlData.publicUrl;
}

async function main() {
    console.log('🚛 SUMTRANS — Importación de Flota con Storage\n');

    // Ensure bucket exists
    const bucketOk = await ensureBucket();
    if (!bucketOk) { console.error('No se pudo preparar el bucket. Abortando.'); return; }

    const allFiles = fs.readdirSync(DOCS_FOLDER)
        .filter(f => ['.pdf', '.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase()));

    let created = 0, failed = 0;

    for (const v of VEHICLES) {
        console.log(`\n📋 ${v.id} — ${v.marca} ${v.modelo}`);

        // Find matching files for this vehicle
        const matchedFiles = allFiles
            .map(file => ({ file, docType: classifyFile(file, v.id) }))
            .filter(x => x.docType !== null);

        if (matchedFiles.length === 0) {
            console.log(`  ⚠️  Sin documentos, creando vehículo vacío`);
        }

        // Upload each PDF to Storage
        const docs = [];
        for (const { file, docType } of matchedFiles) {
            const filePath = path.join(DOCS_FOLDER, file);
            const stats    = fs.statSync(filePath);
            const sizeKB   = (stats.size / 1024).toFixed(1);
            console.log(`  📤 Subiendo: ${file} (${sizeKB} KB)...`);

            const publicUrl = await uploadPDF(v.id, file, filePath);
            if (publicUrl) {
                docs.push({
                    id:          Date.now() + Math.random(),
                    name:        file.replace(/\.pdf$/i, '').trim(),
                    docType,
                    type:        'application/pdf',
                    size:        sizeKB + ' KB',
                    date:        new Date().toLocaleDateString('es-ES'),
                    dataUrl:     publicUrl,  // URL pública en Storage (no base64)
                });
                console.log(`    ✅ OK → ${publicUrl.substring(0, 70)}...`);
            }
            await sleep(300);
        }

        // Create vehicle in Supabase
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

        // Update existing vehicle with document URLs
        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: vehicleData })
            .eq('id', v.id);

        if (updateErr) {
            console.error(`  ❌ Error actualizando ${v.id}:`, updateErr.message);
            failed++;
        } else {
            console.log(`  ✅ ${v.id} actualizado con ${docs.length} documento(s) en Storage`);
            created++;
        }

        await sleep(200);
    }

    console.log(`
╔══════════════════════════════════════╗
║   ✅ Importación completada          ║
╠══════════════════════════════════════╣
║  Vehículos creados:  ${String(created).padEnd(16)}║
║  Con errores:        ${String(failed).padEnd(16)}║
╚══════════════════════════════════════╝
`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
