import fs from 'fs';

let c = fs.readFileSync('src/App.jsx', 'utf8');

// Add routes state after fuelLogs state
const anchor = "const [fuelLogs, setFuelLogs] = usePersistentState('fuelLogs', [])";
if (c.includes(anchor) && !c.includes('const [routes, setRoutes]')) {
    c = c.replace(anchor, anchor + "\n  const [routes, setRoutes] = useState([])");
    fs.writeFileSync('src/App.jsx', c, 'utf8');
    console.log('✅ routes state declaration added');
} else if (c.includes('const [routes, setRoutes]')) {
    console.log('✅ routes state already exists');
} else {
    console.log('❌ anchor not found');
}
