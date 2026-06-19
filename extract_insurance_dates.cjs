/**
 * extract_insurance_dates.cjs
 * Lee los PDFs de seguros, extrae fechas de vencimiento y actualiza
 * cada vehículo en Supabase con la fecha de expiración del seguro
 * y una alerta 1 mes antes.
 */

const fs       = require('fs');
const path     = require('path');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const SEGUROS_FOLDER = 'C:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\01 Corporativos\\03 Seguros\\seguros vigentes';

const FILE_TO_VEHICLE = {
    '9688LLV-FIAT.pdf':                 '9688LLV',
    'FIAT 5834LPF- PACO.pdf':           '5834LPF',
    'FIAT 5835LPF - VICTOR.pdf':        '5835LPF',
    'FIAT NUEVA 0343MMY- FIAT.pdf':     '0343MMY',
    'FIAT-5493 KKX.pdf':                '5493KKX',
    'HYUNDAY 9221KTX-JUAN CARLOS.pdf':  '9221KTX',
    'PEUGEOT-5931LWK.pdf':              '5931LWK',
    'PEUGEOT-5958LWK.pdf':              '5958LWK',
    'POLIZA ALLIANZ FIAT 0159NDM.pdf':  '0159NDM',
    'POLIZA ALLIANZ FIAT 0163NDM.pdf':  '0163NDM',
};

// Patrones para detectar fecha de vencimiento en texto de PDF
function extractExpiryDate(text) {
    const t = text.replace(/\s+/g, ' ');

    // Collect ALL dates found in any expiry-like context, pick the most future one
    const candidates = [];

    const patterns = [
        // Generali: "hasta las 24 horas del 01-07-2026" or "hasta las 00:00 horas del 01-07-2026"
        /hasta\s+las\s+\d{2}[:\s]\d{2}\s+horas?\s+del\s+(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/gi,
        // "hasta las 24:00 del 01/07/2026"
        /hasta\s+las?\s+\d{2}:\d{2}\s+del\s+(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/gi,
        // "Fecha de vencimiento: 28/03/2026"
        /(?:fecha\s+de\s+)?(?:vencimiento|fin\s+de\s+p[oó]liza|válido\s+hasta|vigencia\s+hasta|efecto\s+fin)\s*[:\-]?\s*(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/gi,
        // "período ... al 28/03/2026" or "del 01/01/2025 al 01/01/2026"
        /\b(?:al|hasta)\s+(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4})/gi,
        // "vto. 01/07/2026"
        /vto\.?\s*[:\s]\s*(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/gi,
    ];

    for (const pat of patterns) {
        for (const m of [...t.matchAll(pat)]) {
            const d = parseDate(m[1]);
            if (d && d.getFullYear() >= new Date().getFullYear() && d.getFullYear() <= new Date().getFullYear() + 5) {
                candidates.push(d);
            }
        }
    }

    if (candidates.length === 0) return null;

    // Return the most future date (end of latest policy period)
    candidates.sort((a, b) => b - a);
    return candidates[0];
}

function parseDate(str) {
    if (!str) return null;
    const parts = str.split(/[\/\-\.]/);
    if (parts.length !== 3) return null;
    let [d, m, y] = parts.map(Number);
    if (y < 100) y += 2000;
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m - 1, d);
}

function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function formatDate(date) {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

async function main() {
    console.log('📅 SUMTRANS — Extracción de Fechas de Vencimiento de Seguros\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    const results = [];

    for (const [file, vehicleId] of Object.entries(FILE_TO_VEHICLE)) {
        const filePath = path.join(SEGUROS_FOLDER, file);
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  No encontrado: ${file}`);
            continue;
        }

        process.stdout.write(`📄 ${vehicleId} — ${file}\n   Extrayendo texto...`);
        
        let expiryDate = null;
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData    = await pdfParse(dataBuffer);
            const text       = pdfData.text;
            
            expiryDate = extractExpiryDate(text);

            // Debug: show relevant text snippet
            const lower = text.toLowerCase();
            const keywords = ['vencimiento', 'vto', 'fin de póliza', 'vigencia', 'período', 'periodo', 'hasta'];
            let snippet = '';
            for (const kw of keywords) {
                const idx = lower.indexOf(kw);
                if (idx !== -1) {
                    snippet = text.substring(Math.max(0, idx-10), idx+80).replace(/\s+/g,' ').trim();
                    break;
                }
            }
            if (snippet) console.log(`\n   📝 Contexto: "${snippet}"`);
        } catch (e) {
            console.log(`\n   ❌ Error leyendo PDF: ${e.message}`);
        }

        if (expiryDate) {
            const alertDate = addMonths(expiryDate, -1);
            console.log(`   ✅ Vencimiento: ${formatDate(expiryDate)} | Alerta: ${formatDate(alertDate)}\n`);
            results.push({ vehicleId, file, expiryDate, alertDate });
        } else {
            console.log(`\n   ⚠️  No se pudo extraer fecha automáticamente\n`);
            results.push({ vehicleId, file, expiryDate: null, alertDate: null });
        }
    }

    // --- Update Supabase ---
    console.log('\n💾 Guardando fechas en Supabase...\n');
    let saved = 0, manual = [];

    for (const r of results) {
        if (!r.expiryDate) { manual.push(r); continue; }

        const { data: row, error: fetchErr } = await supabase
            .from('vehicles').select('data').eq('id', r.vehicleId).single();
        if (fetchErr) { console.error(`  ❌ ${r.vehicleId}:`, fetchErr.message); continue; }

        // Update the insurance document with expiry info
        const docs = (row.data?.documents || []).map(doc => {
            if (doc.docType === 'Seguro') {
                return {
                    ...doc,
                    expiryDate:  formatDateISO(r.expiryDate),
                    alertDate:   formatDateISO(r.alertDate),
                    expiryLabel: formatDate(r.expiryDate),
                    alertLabel:  formatDate(r.alertDate),
                };
            }
            return doc;
        });

        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: { ...row.data, documents: docs } })
            .eq('id', r.vehicleId);

        if (updateErr) { console.error(`  ❌ Error ${r.vehicleId}:`, updateErr.message); }
        else { console.log(`  ✅ ${r.vehicleId} — vence ${formatDate(r.expiryDate)}, alerta ${formatDate(r.alertDate)}`); saved++; }
    }

    // --- Final report ---
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTADO\n');
    console.log(`✅ Fechas guardadas automáticamente: ${saved}/${Object.keys(FILE_TO_VEHICLE).length}`);

    if (manual.length > 0) {
        console.log(`\n⚠️  Requieren revisión manual (${manual.length}):`);
        manual.forEach(r => console.log(`   • ${r.vehicleId} — ${r.file}`));
        console.log('\n   → Para estos, introduce la fecha de vencimiento directamente');
        console.log('   → en la ficha del vehículo dentro de la app.');
    }

    console.log('\nAlertas activas en el Dashboard 1 mes antes del vencimiento.');
    console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
