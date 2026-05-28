import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

const hoy = new Date().toISOString().split('T')[0];
const fechaLegible = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

// Supabase schema: { id, status, data: { ...fields } }
// 'status' existe tanto en la columna raíz como dentro de data
const row = (id, fields) => ({ id, status: fields.status, data: { id, ...fields } });

const buildShipments = (driverId) => {
  const base = {
    client: 'SUMTRANS LOGISTICA',
    type: 'Entrega',
    status: 'Asignado',
    assignedDriverId: driverId,
    scheduledDate: hoy,
    date: fechaLegible,
    billingType: 'Clientes Habituales',
    origin: 'SUMTRANS LOGISTICA',
    originAddress: 'C. Gremio de Panadería, 83',
    originCity: 'Córdoba',
    agencyLabel: 'SUM ESPECIAL',
    paymentStatus: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return [
    // ── CABRA CON GPS ───────────────────────────────────────────────────────
    row('TEST-CABRA-001', { ...base, porteType: 'Pagado',
      destinationName: 'Ferretería Industrial Morales (Optimus)',
      destinationAddress: 'Polígono Industrial El Junquillo, 101',
      destinationCity: 'Cabra', destinationZip: '14940', destinationPhone: '957521234',
      destinationCoordinates: '37.4681, -4.4608',
      amount: 5.50, customAmount: 5.50, packages: 1,
      observations: '[TEST] Con coordenadas GPS',
    }),
    row('TEST-CABRA-002', { ...base, porteType: 'Pagado',
      destinationName: 'Egautotractor S.L.',
      destinationAddress: 'C/ Junquillo, 5',
      destinationCity: 'Cabra', destinationZip: '14940', destinationPhone: '957520000',
      destinationCoordinates: '37.4685, -4.4605',
      amount: 7.20, customAmount: 7.20, packages: 2,
      observations: '[TEST] Con coordenadas GPS',
    }),

    // ── CABRA SIN GPS ───────────────────────────────────────────────────────
    row('TEST-CABRA-003', { ...base, porteType: 'Pagado',
      destinationName: 'Ferretería Garrido',
      destinationAddress: 'C/ Doña Leonor, 15',
      destinationCity: 'Cabra', destinationZip: '14940', destinationPhone: '957521111',
      destinationCoordinates: '',
      amount: 4.80, customAmount: 4.80, packages: 1,
      observations: '[TEST] Sin GPS - usa dirección en Google Maps',
    }),
    row('TEST-CABRA-004', { ...base, porteType: 'Debido',
      destinationName: 'Ferretería Manolín',
      destinationAddress: 'Avenida Pedro Iglesias, 4',
      destinationCity: 'Cabra', destinationZip: '14940', destinationPhone: '957522222',
      destinationCoordinates: '',
      amount: 6.00, customAmount: 6.00, packages: 3,
      observations: '[TEST] Sin GPS - usa dirección en Google Maps',
    }),

    // ── PRIEGO CON GPS ──────────────────────────────────────────────────────
    row('TEST-PRIEGO-001', { ...base, porteType: 'Pagado',
      destinationName: 'Ferretería Priego - Cadena 88',
      destinationAddress: 'C/ Lozano Sidro, 21',
      destinationCity: 'Priego de Córdoba', destinationZip: '14800', destinationPhone: '957700100',
      destinationCoordinates: '37.4342, -4.1949',
      amount: 8.50, customAmount: 8.50, packages: 2,
      observations: '[TEST] Con coordenadas GPS',
    }),
    row('TEST-PRIEGO-002', { ...base, porteType: 'Pagado',
      destinationName: 'Paez e Hijos S.L.',
      destinationAddress: 'C/ San Antón, 22',
      destinationCity: 'Priego de Córdoba', destinationZip: '14800', destinationPhone: '957701234',
      destinationCoordinates: '37.4350, -4.1940',
      amount: 9.00, customAmount: 9.00, packages: 1,
      observations: '[TEST] Con coordenadas GPS',
    }),

    // ── PRIEGO SIN GPS ──────────────────────────────────────────────────────
    row('TEST-PRIEGO-003', { ...base, porteType: 'Debido',
      destinationName: 'Saneamientos y Fontanería Rueda S.L.',
      destinationAddress: 'C/ Málaga, 13',
      destinationCity: 'Priego de Córdoba', destinationZip: '14800', destinationPhone: '957702345',
      destinationCoordinates: '',
      amount: 5.00, customAmount: 5.00, packages: 1,
      observations: '[TEST] Sin GPS - usa dirección en Google Maps',
    }),
    row('TEST-PRIEGO-004', { ...base, porteType: 'Pagado',
      destinationName: 'Talleres Lopera e Hijos S.L.',
      destinationAddress: 'Camino de Botana, s/n',
      destinationCity: 'Priego de Córdoba', destinationZip: '14800', destinationPhone: '957703456',
      destinationCoordinates: '',
      amount: 11.00, customAmount: 11.00, packages: 4,
      observations: '[TEST] Sin GPS - usa dirección en Google Maps',
    }),
  ];
};

async function run() {
  // 1. Buscar conductor Miguel
  const { data: drivers, error: driversError } = await supabase.from('drivers').select('id, data');
  if (driversError) { console.error('Error:', driversError); return; }

  const miguel = drivers.find(d => {
    const name = (d.data?.name || d.data?.firstName || '').toLowerCase();
    return name.includes('miguel');
  });

  if (!miguel) {
    console.log('❌ No se encontró el conductor Miguel. Disponibles:');
    drivers.forEach(d => console.log(`  - ID ${d.id}: ${d.data?.name || d.data?.firstName}`));
    return;
  }
  console.log(`✅ Conductor: ${miguel.data?.name || miguel.data?.firstName} (ID: ${miguel.id})`);

  // 2. Borrar tests anteriores
  const testIds = ['TEST-CABRA-001','TEST-CABRA-002','TEST-CABRA-003','TEST-CABRA-004',
                   'TEST-PRIEGO-001','TEST-PRIEGO-002','TEST-PRIEGO-003','TEST-PRIEGO-004'];
  await supabase.from('shipments').delete().in('id', testIds);
  console.log('🗑️  Limpiados tests anteriores');

  // 3. Insertar
  const shipments = buildShipments(miguel.id);
  const { error } = await supabase.from('shipments').insert(shipments);
  if (error) { console.error('❌ Error al insertar:', error); return; }

  console.log(`\n🚀 Creados ${shipments.length} albaranes de prueba para Miguel:\n`);
  console.log('  📍 CON GPS (salen en el mapa Leaflet):');
  console.log('     TEST-CABRA-001  → Ferretería Industrial Morales, Polígono El Junquillo, Cabra');
  console.log('     TEST-CABRA-002  → Egautotractor S.L., C/ Junquillo 5, Cabra');
  console.log('     TEST-PRIEGO-001 → Ferretería Priego Cadena 88, C/ Lozano Sidro 21, Priego');
  console.log('     TEST-PRIEGO-002 → Paez e Hijos S.L., C/ San Antón 22, Priego');
  console.log('\n  🗺️  SIN GPS (solo en Google Maps por dirección):');
  console.log('     TEST-CABRA-003  → Ferretería Garrido, C/ Doña Leonor 15, Cabra');
  console.log('     TEST-CABRA-004  → Ferretería Manolín, Avda. Pedro Iglesias 4, Cabra');
  console.log('     TEST-PRIEGO-003 → Saneamientos Rueda, C/ Málaga 13, Priego');
  console.log('     TEST-PRIEGO-004 → Talleres Lopera, Camino de Botana, Priego');
  console.log('\n✅ Listo. Entra como Miguel en sumtrans-logistica.vercel.app → asígnate los albaranes TEST- → optimiza ruta → Ver Mapa');
}

run();
