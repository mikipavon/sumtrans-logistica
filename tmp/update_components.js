import fs from 'fs';

// 1. App.jsx
let app = fs.readFileSync('src/App.jsx', 'utf8');
app = app.replace(
  /<Drivers drivers=\{drivers\}/g,
  '<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} drivers={drivers}'
);
app = app.replace(
  /<DriverDashboard\s*\n\s*driverId=\{currentDriverId\}/g,
  '<DriverDashboard\n          driverId={currentDriverId}\n          routes={routes}'
);
fs.writeFileSync('src/App.jsx', app, 'utf8');
console.log('✅ App.jsx updated');

// 2. Drivers.jsx
let drivers = fs.readFileSync('src/pages/Drivers.jsx', 'utf8');
drivers = drivers.replace(
  /export default function Drivers\(\{ (.*) \}\) \{/g,
  'export default function Drivers({ $1, routes, onUpdateRoutes }) {'
);
drivers = drivers.replace(
  /<DriverProfileModal\s*\n\s*isOpen=\{isProfileOpen\}/g,
  '<DriverProfileModal\n                routes={routes}\n                onUpdateRoutes={onUpdateRoutes}\n                isOpen={isProfileOpen}'
);
fs.writeFileSync('src/pages/Drivers.jsx', drivers, 'utf8');
console.log('✅ Drivers.jsx updated');
