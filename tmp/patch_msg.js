import fs from 'fs';
const path = 'src/pages/driver/DriverDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');
const norm = c => c.replace(/\r\n/g, '\n');

const old = `setLearningMessage("Optimizada por cercanía y aprendizaje histórico.");`;
const rep = `const hasTownPriority = (currentDriver?.morningTowns?.length > 0 || currentDriver?.afternoonTowns?.length > 0);
                    const shiftLabel = new Date().getHours() < 14 ? '☀️ Mañana' : '🌙 Tarde';
                    setLearningMessage(hasTownPriority ? \`Optimizada (\${shiftLabel}) + cercanía + aprendizaje.\` : "Optimizada por cercanía y aprendizaje histórico.");`;

if (content.includes(old)) {
    content = content.replace(old, rep);
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ Message updated');
} else {
    console.log('❌ Not found');
}
