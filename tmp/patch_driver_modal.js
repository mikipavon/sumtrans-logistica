import fs from 'fs';

const path = 'src/components/drivers/DriverProfileModal.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Signature
const sigOld = "export default function DriverProfileModal({ isOpen, onClose, driver, shipments, clients, onUpdateDriver, isGhostModeUnlocked }) {";
const sigNew = "export default function DriverProfileModal({ isOpen, onClose, driver, shipments, clients, onUpdateDriver, isGhostModeUnlocked, routes, onUpdateRoutes }) {";
content = content.replace(sigOld, sigNew);

// 2. Default routes fallback inside render
const activeRoutes = "const activeRoutes = routes && routes.length > 0 ? routes : RUTAS_MAESTRAS;";

// Replace map of RUTAS_MAESTRAS with activeRoutes
content = content.replace(/RUTAS_MAESTRAS\.map/g, "activeRoutes.map");

// 3. Remove the entire towns priority block
const townsBlockStart = "                            {/* Morning/Afternoon Town Priorities */}";
const townsBlockEnd = "                            <p className=\"text-xs text-blue-600/70 mt-3\">";

const startIdx = content.indexOf(townsBlockStart);
const endIdx = content.indexOf(townsBlockEnd);

if (startIdx !== -1 && endIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    
    // Check if we need to insert activeRoutes definition anywhere?
    // We can just define activeRoutes at the top of the component
    
    content = before + after;
    console.log("✅ Removed towns priority UI");
} else {
    console.log("❌ Could not find towns section to remove", startIdx, endIdx);
}

// 4. Add activeRoutes inside the component (near top)
const stateDecl = "const [morningInput, setMorningInput] = useState('');";
content = content.replace(stateDecl, stateDecl + "\n    const activeRoutes = routes && routes.length > 0 ? routes : RUTAS_MAESTRAS;");


fs.writeFileSync(path, content, 'utf8');
console.log("✅ DriverProfileModal patched!");
