import fs from 'fs';

// ============================================================
// STEP 1: Update rutas.js to export a DEFAULT list + helper
// ============================================================
const rutasContent = `// Default routes (fallback if DB is empty)
export const DEFAULT_RUTAS = [
  {
    id: 'ruta-lucena-cabra',
    nombre: 'Ruta Lucena-Cabra (Principal)',
    poblaciones: ['Lucena', 'Cabra', 'Doña Mencía', 'Zuheros']
  },
  {
    id: 'ruta-rute-iznajar',
    nombre: 'Ruta Rute-Iznájar (Sur)',
    poblaciones: ['Rute', 'Iznájar', 'Cuevas de San Marcos', 'Encinas Reales']
  },
  {
    id: 'ruta-priego',
    nombre: 'Ruta Priego-Almedinilla',
    poblaciones: ['Priego de Córdoba', 'Almedinilla', 'Carcabuey']
  },
  {
    id: 'ruta-aguilar',
    nombre: 'Ruta Aguilar-Montilla',
    poblaciones: ['Aguilar de la Frontera', 'Montilla', 'La Rambla']
  }
];

// Backward compat alias
export const RUTAS_MAESTRAS = DEFAULT_RUTAS;

export const findRouteByCity = (city, routes) => {
  if (!city) return null;
  const normCity = city.trim().toLowerCase();
  const list = routes || DEFAULT_RUTAS;
  return list.find(r => 
    r.poblaciones.some(p => p.toLowerCase() === normCity)
  );
};
`;

fs.writeFileSync('src/data/rutas.js', rutasContent, 'utf8');
console.log('✅ Step 1: rutas.js updated');

// ============================================================
// STEP 2: Add routes state + loading + saving in App.jsx
// ============================================================
let appContent = fs.readFileSync('src/App.jsx', 'utf8');

// 2a. Add routes state near other state declarations
// Find the coverageZones state
const covState = "const [coverageZones, setCoverageZones] = useState([])";
if (appContent.includes(covState)) {
  appContent = appContent.replace(covState, covState + `\n  const [routes, setRoutes] = useState([])`);
  console.log('✅ Step 2a: routes state added');
} else {
  console.log('❌ Step 2a: coverageZones state not found');
}

// 2b. Load routes from settings in the data loading section
const loadRouteAfter = "supabase.from('coverage_zones').select('*')";
if (appContent.includes(loadRouteAfter)) {
  appContent = appContent.replace(
    loadRouteAfter,
    loadRouteAfter + `,\n          supabase.from('settings').select('*').eq('key', 'routes')`
  );
  console.log('✅ Step 2b: routes query added');
} else {
  console.log('❌ Step 2b: coverage_zones query not found');
}

// 2c. Add destructuring for routes result
const covDestructure = "{ data: covZones }";
if (appContent.includes(covDestructure)) {
  appContent = appContent.replace(covDestructure, covDestructure + `,\n          { data: routesData }`);
  console.log('✅ Step 2c: routes destructuring added');
} else {
  console.log('❌ Step 2c: covZones destructuring not found');
}

// 2d. Parse and set routes after coverageZones
const covSetLine = "if (covZones) setCoverageZones(covZones.map(z => ({ ...z.data, id: z.id })))";
if (appContent.includes(covSetLine)) {
  appContent = appContent.replace(covSetLine, covSetLine + `\n        if (routesData && routesData.length > 0) {\n          try { setRoutes(JSON.parse(routesData[0].value)) } catch(e) { console.error('Error parsing routes:', e) }\n        }`);
  console.log('✅ Step 2d: routes parsing added');
} else {
  console.log('❌ Step 2d: covZones set not found');
}

// 2e. Add handleUpdateRoutes function near handleUpdateDriver
const updateDriverFn = "const handleUpdateDriver = async (driverId, updatedData) => {";
if (appContent.includes(updateDriverFn)) {
  const routesFn = `  const handleUpdateRoutes = async (newRoutes) => {
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'routes', value: JSON.stringify(newRoutes) });
      if (error) throw error;
      setRoutes(newRoutes);
    } catch(e) { console.error('Error saving routes:', e); alert('Error al guardar rutas'); }
  }

  ` + updateDriverFn;
  appContent = appContent.replace(updateDriverFn, routesFn);
  console.log('✅ Step 2e: handleUpdateRoutes function added');
} else {
  console.log('❌ Step 2e: handleUpdateDriver function not found');
}

fs.writeFileSync('src/App.jsx', appContent, 'utf8');
console.log('✅ Step 2: App.jsx updated');

console.log('\n✅ All patches applied! Next: update DriverProfileModal and optimizer.');
