import fs from 'fs';

const path = 'src/pages/driver/DriverDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add routes back to the props
const targetProp = "export default function DriverDashboard({ driverId, shipments, clients, onUpdateShipment, onUpdateClient, drivers, onStatusChange, activeTestMode, currentDriver }) {";
const replacementProp = "export default function DriverDashboard({ driverId, shipments, clients, onUpdateShipment, onUpdateClient, drivers, onStatusChange, activeTestMode, currentDriver, routes }) {";

if (content.includes(targetProp)) {
    content = content.replace(targetProp, replacementProp);
    console.log("✅ Prop `routes` added to DriverDashboard");
} else {
    // maybe it already has it?
    if(!content.includes('routes }) {')) console.log("❌ Target prop signature not found");
}

// 2. Add DEFAULT_RUTAS import
const importRutas = "import { RUTAS_MAESTRAS } from '../../data/rutas';";
const importReplacement = "import { RUTAS_MAESTRAS, DEFAULT_RUTAS } from '../../data/rutas';";
if (content.includes(importRutas) && !content.includes('DEFAULT_RUTAS')) {
    content = content.replace(importRutas, importReplacement);
} else if (!content.includes('DEFAULT_RUTAS')) {
    const iconImportIndex = content.indexOf('import {');
    content = content.slice(0, iconImportIndex) + "import { DEFAULT_RUTAS } from '../../data/rutas';\n" + content.slice(iconImportIndex);
}
console.log("✅ Import added");

// 3. Update the optimizer
const oldCode = `                        // Morning/Afternoon town priority setup
                        const currentHour = new Date().getHours();
                        const isMorningShift = currentHour < 14;
                        const driverMorningTowns = (currentDriver?.morningTowns || []).map(t => t.trim().toLowerCase());
                        const driverAfternoonTowns = (currentDriver?.afternoonTowns || []).map(t => t.trim().toLowerCase());`;

const newCode = `                        // Morning/Afternoon town priority setup (USING ASSIGNED ROUTES)
                        const currentHour = new Date().getHours();
                        const isMorningShift = currentHour < 14;
                        const activeRoutes = routes && routes.length > 0 ? routes : DEFAULT_RUTAS;
                        
                        const morningRoute = activeRoutes.find(r => r.id === currentDriver?.morningRouteId);
                        const afternoonRoute = activeRoutes.find(r => r.id === currentDriver?.afternoonRouteId);
                        
                        const driverMorningTowns = (morningRoute?.poblaciones || []).map(t => t.trim().toLowerCase());
                        const driverAfternoonTowns = (afternoonRoute?.poblaciones || []).map(t => t.trim().toLowerCase());`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = oldCode.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOld)) {
    content = content.replace(/\r\n/g, '\n').replace(normalizedOld, newCode.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ Optimizer patched to use Routes');
} else {
    console.log('❌ Target content not found in DriverDashboard');
}
