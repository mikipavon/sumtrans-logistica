// Default routes (fallback if DB is empty)
export const DEFAULT_RUTAS = [
  {
    id: 'ruta-lucena-cabra',
    nombre: 'Ruta Lucena-Cabra (Principal)',
    poblacionesManana: ['Lucena', 'Cabra', 'Doña Mencía', 'Zuheros']
  },
  {
    id: 'ruta-rute-iznajar',
    nombre: 'Ruta Rute-Iznájar (Sur)',
    poblacionesManana: ['Rute', 'Iznájar', 'Cuevas de San Marcos', 'Encinas Reales']
  },
  {
    id: 'ruta-priego',
    nombre: 'Ruta Priego-Almedinilla',
    poblacionesManana: ['Priego de Córdoba', 'Almedinilla', 'Carcabuey']
  },
  {
    id: 'ruta-aguilar',
    nombre: 'Ruta Aguilar-Montilla',
    poblacionesManana: ['Aguilar de la Frontera', 'Montilla', 'La Rambla']
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
