/**
 * Script para insertar clientes de Presupuesto en Supabase.
 * Ejecutar: node insert_presupuesto_clients.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

const NAMES = [
  'AUTOTR RAMIREZ',
  'BAENA SOLAR',
  'BARRERA',
  'BOBISUB',
  'CANOCARS',
  'CASTRO Y YEBENES',
  'CHAPIVA',
  'CURIEL',
  'DAKATO',
  'DESGUACES CAMPIÑA',
  'DIONISIO ARENAS',
  'ELECTROBADO',
  'ELECTROFRIO LUCENTINO',
  'EPS SOLAR',
  'ESMEBRA',
  'FEDE',
  'FRJAVIER ARIAS',
  'FRIO OSUNA',
  'GAS CAMPIÑA SUR',
  'GERMOTOS',
  'HEMANOS GALVEZ RUIZ',
  'HIDRAULICA CARTEYANA',
  'INSPAVICARS',
  'JOAQUIN GARRIDO',
  'JOAQUIN LUQUE',
  'JOAQUIN SALIDO el repues',
  'JOSE CARRASCO',
  'JOSE SERRANO',
  'JOYMA CABRA',
  'JUAN ALBA',
  'JUAN DE DIOS',
  'JUAN MONTES',
  'LOPERA Y JIMENEZ',
  'Manue Barrera',
  'MAQUINARIA LUQUE',
  'MC',
  'MINIAUTOS',
  'MOLINA BACCA',
  'MONTERREAL',
  'MOP',
  'NEUMATICOS FELIPE',
  'PACO MESA',
  'R.BERMUDEZ',
  'RECTICOR',
  'SANCHEZ CIVICO',
  'SERCOR',
  'SUMELCA',
  'TURBOS RR',
  'T.Trujillo',
  'T.AGUILERA',
  'T.CARRASCO',
  'T.CRIADO',
  'T.VILLEGAS',
  'TALLERES LOPERA',
  'TRANER',
  'VENDING SQUADS',
  'VIDEOCOLOR',
  'VIFERMOTOS',
  'VILLALVA DONCEL',
  'RECTIFICADOS EL GRANAD.',
  'reparamovil',
  'ALFREDO SALAS',
  'TALLERES MONTERREAL',
];

async function main() {
  // 1. Cargar clientes existentes para saber qué números P- ya están usados
  const { data: existingClients, error: fetchErr } = await supabase.from('clients').select('*');
  if (fetchErr) { console.error('Error cargando clientes:', fetchErr); return; }

  const allClients = (existingClients || []).map(c => ({ ...c.data, id: c.id }));

  // Calcular los nombres ya existentes para no duplicar
  const existingNames = new Set(allClients.map(c => String(c.name || '').toLowerCase().trim()));

  // Calcular el siguiente número P- libre
  const usedPNumbers = new Set();
  allClients.forEach(c => {
    const str = String(c.clientNumber || '').trim();
    if (str.startsWith('P-')) {
      const num = parseInt(str.substring(2), 10);
      if (!isNaN(num) && num > 0) usedPNumbers.add(num);
    }
  });

  let nextP = 1;
  const getNextP = () => {
    while (usedPNumbers.has(nextP)) nextP++;
    usedPNumbers.add(nextP);
    return `P-${nextP}`;
  };

  // 2. Filtrar los que ya existen
  const toInsert = NAMES.filter(name => !existingNames.has(name.toLowerCase().trim()));

  if (toInsert.length === 0) {
    console.log('✅ Todos los clientes ya existen. Nada que insertar.');
    return;
  }

  console.log(`📋 Insertando ${toInsert.length} clientes nuevos de Presupuesto (${NAMES.length - toInsert.length} ya existían)...\n`);

  // 3. Crear los registros
  const records = toInsert.map(name => {
    const id = Date.now() + Math.floor(Math.random() * 100000);
    const clientNumber = getNextP();
    const clientData = {
      id,
      name,
      legalName: '',
      cif: '',
      address: '',
      city: '',
      zip: '',
      province: '',
      phone: '',
      mobile: '',
      email: '',
      coordinates: '',
      opAddress: '',
      opCity: '',
      opZip: '',
      type: 'Remitente',
      billingType: 'Presupuesto',
      tariffType: 'General',
      customRates: {},
      customRatesB2: {},
      allowedArticles: [],
      codFee: '',
      color: '#64748b',
      priority: 'normal',
      username: '',
      password: '',
      clientNumber,
      lastInteraction: new Date().toISOString().split('T')[0],
      requireWeight: false,
      requireDNI: false,
      requirePhoto: false,
      requireSignature: true,
    };
    return { id, name, data: clientData };
  });

  // 4. Insertar en lotes de 20
  const BATCH = 20;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from('clients').insert(batch);
    if (error) {
      console.error(`❌ Error en lote ${i}-${i + batch.length}:`, error.message);
    } else {
      inserted += batch.length;
      batch.forEach(r => console.log(`  ✅ ${r.data.clientNumber} — ${r.name}`));
    }
  }

  console.log(`\n🎉 Listo! ${inserted}/${toInsert.length} clientes insertados con tipo "Presupuesto".`);
  console.log('Recarga la app para verlos.');
}

main();
